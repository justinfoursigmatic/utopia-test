import { mergeImports } from '../../../core/workers/common/project-file-utils'
import type { DerivedState, EditorState } from '../../../components/editor/store/editor-state'
import type { Imports } from '../../../core/shared/project-file-types'
import type { BaseCommand, WhenToRun, CommandFunction, CommandFunctionResult } from './commands'
import { patchParseSuccessAtFilePath } from './patch-utils'

export interface AddImportsToFile extends BaseCommand {
  type: 'ADD_IMPORTS_TO_FILE'
  targetFile: string
  imports: Imports
}

export function addImportsToFile(
  whenToRun: WhenToRun,
  targetFile: string,
  imports: Imports,
): AddImportsToFile {
  return {
    type: 'ADD_IMPORTS_TO_FILE',
    whenToRun: whenToRun,
    targetFile: targetFile,
    imports: imports,
  }
}

export const runAddImportsToFile: CommandFunction<AddImportsToFile> = (
  editorState: EditorState,
  derivedState: DerivedState,
  command: AddImportsToFile,
): CommandFunctionResult => {
  const editorStatePatch = patchParseSuccessAtFilePath(
    command.targetFile,
    editorState,
    (parseSuccess) => {
      const updatedImports = mergeImports(command.targetFile, parseSuccess.imports, command.imports)
      return {
        imports: {
          $set: updatedImports,
        },
      }
    },
  )

  return {
    editorStatePatches: [editorStatePatch],
    commandDescription: `Added imports to ${command.targetFile}.`,
  }
}
