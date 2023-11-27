import {
  deleteFileFromCollaboration,
  updateExportsDetailFromCollaborationUpdate,
  updateImportsFromCollaborationUpdate,
} from '../actions/action-creators'
import type {
  CollabFile,
  CollabTextFile,
  CollabTextFileExportsDetail,
  CollabTextFileImports,
  CollabTextFileTopLevelElements,
  CollaborativeEditingSupportSession,
} from './editor-state'
import type { ProjectContentsTree } from '../../../components/assets'
import {
  type ProjectContentTreeRoot,
  getProjectFileFromTree,
  isProjectContentFile,
  zipContentsTree,
} from '../../../components/assets'
import type { EditorAction, EditorDispatch } from '../action-types'
import { updateTopLevelElementsFromCollaborationUpdate } from '../actions/action-creators'
import { assertNever, isBrowserEnvironment } from '../../../core/shared/utils'
import type {
  ExportDetail,
  ImportDetails,
  ParseSuccess,
} from '../../../core/shared/project-file-types'
import { isTextFile } from '../../../core/shared/project-file-types'
import {
  ExportDetailKeepDeepEquality,
  ImportDetailsKeepDeepEquality,
  ParsedTextFileKeepDeepEquality,
  TopLevelElementKeepDeepEquality,
} from './store-deep-equality-instances'
import {
  deletePathChange,
  ensureDirectoryExistsChange,
  writeProjectFileChange,
  type ProjectChanges,
  type ProjectFileChange,
} from './vscode-changes'
import * as Y from 'yjs'
import type { TopLevelElement } from '../../../core/shared/element-template'
import { isFeatureEnabled } from '../../../utils/feature-switches'
import type { KeepDeepEqualityCall } from '../../../utils/deep-equality'
import type { MapLike } from 'typescript'

const TopLevelElementsKey = 'topLevelElements'
const ExportsDetailKey = 'exportsDetail'
const ImportsKey = 'imports'

// FIXME: This is very slow an inefficient, but is a stopgap measure for right now.
function removeSourceMaps(topLevelElements: Array<TopLevelElement>): Array<TopLevelElement> {
  return JSON.parse(JSON.stringify(topLevelElements, (k, v) => (k === 'sourceMap' ? null : v)))
}

export function collateCollaborativeProjectChanges(
  oldContents: ProjectContentTreeRoot,
  newContents: ProjectContentTreeRoot,
): Array<ProjectFileChange> {
  let changesToProcess: Array<ProjectFileChange> = []

  function applyChanges(
    fullPath: string,
    firstContents: ProjectContentsTree,
    secondContents: ProjectContentsTree,
  ): boolean {
    if (isProjectContentFile(firstContents)) {
      if (isProjectContentFile(secondContents)) {
        if (firstContents.content === secondContents.content) {
          // Do nothing, no change.
        } else if (isTextFile(firstContents.content) && isTextFile(secondContents.content)) {
          if (
            ParsedTextFileKeepDeepEquality(
              firstContents.content.fileContents.parsed,
              secondContents.content.fileContents.parsed,
            ).areEqual
          ) {
            // Do nothing, no change.
          } else {
            const secondRevisionState = secondContents.content.fileContents.revisionsState
            const revisionStateIsAppropriate = secondRevisionState === 'BOTH_MATCH'
            const fileShouldBeWritten = revisionStateIsAppropriate
            if (fileShouldBeWritten) {
              changesToProcess.push(writeProjectFileChange(fullPath, secondContents.content))
            }
          }
        } else {
          changesToProcess.push(writeProjectFileChange(fullPath, secondContents.content))
        }
      } else {
        changesToProcess.push(deletePathChange(fullPath, true))
        changesToProcess.push(ensureDirectoryExistsChange(fullPath))
      }
    } else {
      if (isProjectContentFile(secondContents)) {
        changesToProcess.push(deletePathChange(fullPath, true))
        changesToProcess.push(writeProjectFileChange(fullPath, secondContents.content))
      } else {
        // Do nothing, both sides are a directory.
      }
    }

    return true
  }

  function onElement(
    fullPath: string,
    firstContents: ProjectContentsTree | null,
    secondContents: ProjectContentsTree | null,
  ): boolean {
    if (firstContents == null) {
      if (secondContents == null) {
        // Do nothing, nothing exists.
        return false
      } else {
        changesToProcess.push(
          writeProjectFileChange(fullPath, getProjectFileFromTree(secondContents)),
        )
        return true
      }
    } else {
      if (secondContents == null) {
        changesToProcess.push(deletePathChange(fullPath, true))
        return false
      } else {
        if (firstContents === secondContents) {
          // Same value, stop here.
          return false
        } else {
          return applyChanges(fullPath, firstContents, secondContents)
        }
      }
    }
  }
  if (isBrowserEnvironment && isFeatureEnabled('Collaboration')) {
    if (oldContents != newContents) {
      zipContentsTree(oldContents, newContents, onElement)
    }
  }

  return changesToProcess
}

function applyFileChangeToMap(
  change: ProjectFileChange,
  projectContentsMap: CollaborativeEditingSupportSession['projectContents'],
  mergeDoc: Y.Doc,
): void {
  switch (change.type) {
    case 'DELETE_PATH':
      for (const key of projectContentsMap.keys()) {
        if (
          key === change.fullPath ||
          (change.recursive && key.startsWith(`${change.fullPath}/`))
        ) {
          projectContentsMap.delete(key)
        }
      }
      break
    case 'WRITE_PROJECT_FILE':
      if (
        change.projectFile.type === 'TEXT_FILE' &&
        change.projectFile.fileContents.parsed.type === 'PARSE_SUCCESS'
      ) {
        const parsedPart = change.projectFile.fileContents.parsed
        let collabFile: CollabTextFile
        if (projectContentsMap.has(change.fullPath)) {
          collabFile = projectContentsMap.get(change.fullPath)!
          // TODO Handle not text type
        } else {
          collabFile = new Y.Map()
          collabFile.set('type', 'TEXT_FILE')
          const topLevelElementsArray = new Y.Array<TopLevelElement>()
          collabFile.set(TopLevelElementsKey, topLevelElementsArray)
          const exportsDetailArray = new Y.Array<ExportDetail>()
          collabFile.set(ExportsDetailKey, exportsDetailArray)
          const importsMap = new Y.Map<ImportDetails>()
          collabFile.set(ImportsKey, importsMap)
        }

        mergeDoc.transact(() => {
          if (!projectContentsMap.has(change.fullPath)) {
            projectContentsMap.set(change.fullPath, collabFile)
          }
          synchroniseParseSuccessToCollabFile(parsedPart, collabFile)
        })
      }
      break
    case 'ENSURE_DIRECTORY_EXISTS':
      // Not necessary to handle right now.
      break
    default:
      assertNever(change)
  }
}

export function updateCollaborativeProjectContents(
  session: CollaborativeEditingSupportSession,
  projectChanges: ProjectChanges,
  filesModifiedByAnotherUser: Array<string>,
): void {
  const projectContentsMap = session.projectContents
  for (const change of projectChanges.fileChanges.collabProjectChanges) {
    if (!filesModifiedByAnotherUser.includes(change.fullPath)) {
      applyFileChangeToMap(change, projectContentsMap, session.mergeDoc)
    }
  }
}

export function addHookForProjectChanges(
  session: CollaborativeEditingSupportSession,
  dispatch: EditorDispatch,
): void {
  session.projectContents.observeDeep((changeEvents) => {
    let actionsToDispatch: Array<EditorAction> = []
    // TODO Check that this is the array change before doing anything
    for (const changeEvent of changeEvents) {
      switch (changeEvent.path.length) {
        // This case indicates a change at the base of the entire structure, which
        // appears to arise at least on first connection to sync up the entire value.
        case 0: {
          if (changeEvent instanceof Y.YMapEvent) {
            actionsToDispatch.push(...updateEntireProjectContents(changeEvent as Y.YMapEvent<any>))
          } else {
            throw new Error(`Could not treat change event as Y.YMapEvent.`)
          }
          break
        }
        // Originally thought to be a case that would arise on a new addition of
        // a file, left here to capture this specific case in case it does show up.
        case 1: {
          throw new Error(`Unhandled path length of 1: ${changeEvent.path}`)
        }
        // When a change happens to the `topLevelElements` in a particular file,
        // this case should show up as the path will consist of the filename and
        // the string `topLevelElements`.
        case 2: {
          const filePath = changeEvent.path[0] as string
          const targetProperty = changeEvent.path[1]
          switch (targetProperty) {
            case TopLevelElementsKey:
              actionsToDispatch.push(updateTopLevelElementsOfFile(session, filePath))
              break
            case ExportsDetailKey:
              actionsToDispatch.push(updateExportsDetailOfFile(session, filePath))
              break
            case ImportsKey:
              actionsToDispatch.push(updateImportsOfFile(session, filePath))
              break
            default:
              throw new Error(`Unexpected second part of change path: ${targetProperty}`)
          }
          break
        }
        default:
          throw new Error(`Unexpected change path: ${JSON.stringify(changeEvent.path)}`)
      }
    }
    dispatch(actionsToDispatch)
  })
}

function updateEntireProjectContents(changeEvent: Y.YMapEvent<any>): Array<EditorAction> {
  let actions: Array<EditorAction> = []
  // Map from filename to the restricted file contents.
  const targetMap = changeEvent.currentTarget as Y.Map<CollabFile>
  for (const [filename, change] of changeEvent.keys.entries()) {
    switch (change.action) {
      case 'delete':
        actions.push(deleteFileFromCollaboration(filename))
        break
      case 'add':
      case 'update':
        // Mysteriously the type doesn't really carry over.
        const entryFile = targetMap.get(filename) as CollabFile
        // Handle `topLevelElements`.
        const topLevelElements = entryFile.get(TopLevelElementsKey) as
          | CollabTextFileTopLevelElements
          | undefined
        if (topLevelElements != null) {
          actions.push(
            updateTopLevelElementsFromCollaborationUpdate(filename, topLevelElements.toArray()),
          )
        }
        // Handle `exportsDetail`.
        const exportsDetail = entryFile.get(ExportsDetailKey) as
          | CollabTextFileExportsDetail
          | undefined
        if (exportsDetail != null) {
          actions.push(
            updateExportsDetailFromCollaborationUpdate(filename, exportsDetail.toArray()),
          )
        }
        // Handle `imports`.
        const imports = entryFile.get(ImportsKey) as CollabTextFileImports | undefined
        if (imports != null) {
          actions.push(updateImportsFromCollaborationUpdate(filename, imports.toJSON()))
        }
        break
      default:
        assertNever(change.action)
    }
  }

  // Return the accumulated editor actions.
  return actions
}

function updateEditorWithArrayChanges<T>(
  session: CollaborativeEditingSupportSession,
  filePath: string,
  fileKey: string,
  makeUpdateAction: (filePath: string, newElements: Array<T>) => EditorAction,
): EditorAction {
  const file = session.projectContents.get(filePath)
  const yjsValue: Y.Array<T> = (file?.get(fileKey) as any as Y.Array<T>) ?? new Y.Array()
  let editorValue: Array<T> = yjsValue.toArray()
  return makeUpdateAction(filePath, editorValue)
}

function updateEditorWithMapChanges<T>(
  session: CollaborativeEditingSupportSession,
  filePath: string,
  fileKey: string,
  makeUpdateAction: (filePath: string, newValue: MapLike<T>) => EditorAction,
): EditorAction {
  const file = session.projectContents.get(filePath)
  const yjsValue: Y.Map<T> = (file?.get(fileKey) as any as Y.Map<T>) ?? new Y.Map()
  const editorValue = yjsValue.toJSON()
  return makeUpdateAction(filePath, editorValue)
}

function updateTopLevelElementsOfFile(
  session: CollaborativeEditingSupportSession,
  filePath: string,
): EditorAction {
  return updateEditorWithArrayChanges(
    session,
    filePath,
    TopLevelElementsKey,
    updateTopLevelElementsFromCollaborationUpdate,
  )
}

function updateExportsDetailOfFile(
  session: CollaborativeEditingSupportSession,
  filePath: string,
): EditorAction {
  return updateEditorWithArrayChanges(
    session,
    filePath,
    ExportsDetailKey,
    updateExportsDetailFromCollaborationUpdate,
  )
}

function updateImportsOfFile(
  session: CollaborativeEditingSupportSession,
  filePath: string,
): EditorAction {
  return updateEditorWithMapChanges(
    session,
    filePath,
    ImportsKey,
    updateImportsFromCollaborationUpdate,
  )
}

interface NoChange {
  type: 'NO_CHANGE'
}

const noChange: NoChange = {
  type: 'NO_CHANGE',
}

interface ChangeHere<T> {
  type: 'CHANGE_HERE'
  updatedValue: T
}

function changeHere<T>(updatedValue: T): ChangeHere<T> {
  return {
    type: 'CHANGE_HERE',
    updatedValue: updatedValue,
  }
}

interface Deleted {
  type: 'DELETED'
}

const deleted: Deleted = {
  type: 'DELETED',
}

type ArrayChange<T> = NoChange | ChangeHere<T> | Deleted

type ArrayChanges<T> = Array<ArrayChange<T>>

export function calculateArrayChanges<T>(
  from: Array<T>,
  into: Y.Array<T>,
  equals: (from: T, into: T) => boolean = (fromToCheck, intoToCheck) => fromToCheck === intoToCheck,
): ArrayChanges<T> {
  let arrayChanges: ArrayChanges<T> = []

  for (let index: number = 0; index < Math.max(from.length, into.length); index++) {
    if (index > from.length - 1) {
      arrayChanges.push(deleted)
    } else if (index > into.length - 1) {
      arrayChanges.push(changeHere(from[index]))
    } else if (!equals(from[index], into.get(index))) {
      arrayChanges.push(changeHere(from[index]))
    } else {
      arrayChanges.push(noChange)
    }
  }

  return arrayChanges
}

function syncArrayChanges<T>(
  fromArray: Array<T>,
  collabFile: CollabTextFile,
  fileKey: string,
  keepDeep: KeepDeepEqualityCall<T>,
): void {
  const againstArray = collabFile.get(fileKey) as any as Y.Array<T>
  const elementChanges = calculateArrayChanges(
    fromArray,
    againstArray,
    (l, r) => l != null && r != null && keepDeep(l, r).areEqual,
  )
  let index: number = 0
  elementChanges.forEach((change) => {
    switch (change.type) {
      case 'DELETED':
        againstArray.delete(index, 1)
        break
      case 'CHANGE_HERE':
        if (againstArray.length > index) {
          againstArray.delete(index, 1)
        }
        againstArray.insert(index, [change.updatedValue])
        index += 1
        break
      case 'NO_CHANGE':
        index += 1
        break
    }
  })
}

function syncMapChanges<T>(
  fromMap: MapLike<T>,
  collabFile: CollabTextFile,
  fileKey: string,
  keepDeep: KeepDeepEqualityCall<T>,
): void {
  const againstMap = collabFile.get(fileKey) as any as Y.Map<T>
  let keysChecked: Set<string> = new Set()
  for (const [keyFromMap, valueFromMap] of Object.entries(fromMap)) {
    keysChecked.add(keyFromMap)
    if (againstMap.has(keyFromMap)) {
      // Value exists in both maps, but has changed.
      if (!keepDeep(valueFromMap, againstMap.get(keyFromMap)!).areEqual) {
        againstMap.set(keyFromMap, valueFromMap)
      }
    } else {
      // Value does not exist in against map, so should be added.
      againstMap.set(keyFromMap, valueFromMap)
    }
  }
  // For any key that we haven't seen in the from map,
  // it should be deleted from the against map.
  for (const keyAgainstMap of againstMap.keys()) {
    if (!keysChecked.has(keyAgainstMap)) {
      againstMap.delete(keyAgainstMap)
    }
  }
}

function synchroniseParseSuccessToCollabFile(
  success: ParseSuccess,
  collabFile: CollabTextFile,
): void {
  // Source maps tend to bloat the data but are not necessary.
  const strippedTopLevelElements = removeSourceMaps(success.topLevelElements)
  // Updates to the `topLevelElements`.
  syncArrayChanges<TopLevelElement>(
    strippedTopLevelElements,
    collabFile,
    TopLevelElementsKey,
    TopLevelElementKeepDeepEquality,
  )

  // Updates to the `exportsDetail`.
  syncArrayChanges<ExportDetail>(
    success.exportsDetail,
    collabFile,
    ExportsDetailKey,
    ExportDetailKeepDeepEquality,
  )

  // Updates to the `imports`.
  syncMapChanges<ImportDetails>(
    success.imports,
    collabFile,
    ImportsKey,
    ImportDetailsKeepDeepEquality,
  )
}
