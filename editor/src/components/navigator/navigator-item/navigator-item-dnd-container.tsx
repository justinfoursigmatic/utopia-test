import React from 'react'
import { DropTargetMonitor, useDrag, useDrop } from 'react-dnd'
import { ElementPath } from '../../../core/shared/project-file-types'
import { EditorAction, EditorDispatch } from '../../editor/action-types'
import * as EditorActions from '../../editor/actions/action-creators'
import * as MetaActions from '../../editor/actions/meta-actions'
import * as EP from '../../../core/shared/element-path'
import {
  hideNavigatorDropTargetHint,
  reorderComponents,
  showNavigatorDropTargetHint,
} from '../actions'
import { ExpansionArrowWidth } from './expandable-indicator'
import { BasePaddingUnit, NavigatorItem, ParentOutline } from './navigator-item'
import {
  NavigatorHintBottom,
  NavigatorHintCircleDiameter,
  NavigatorHintTop,
} from './navigator-item-components'
import {
  CanvasSizeAtom,
  ConditionalClauseNavigatorEntry,
  DropTargetHint,
  DropTargetType,
  EditorState,
  navigatorEntriesEqual,
  NavigatorEntry,
  regularNavigatorEntry,
  syntheticNavigatorEntry,
  varSafeNavigatorEntryToKey,
} from '../../editor/store/editor-state'
import {
  Substores,
  useEditorState,
  useRefEditorState,
} from '../../../components/editor/store/store-hook'
import { isAllowedToReparent } from '../../canvas/canvas-strategies/strategies/reparent-helpers/reparent-helpers'
import { MetadataUtils } from '../../../core/model/element-metadata-utils'
import { getEmptyImage } from 'react-dnd-html5-backend'
import { when } from '../../../utils/react-conditionals'
import { metadataSelector } from '../../inspector/inpector-selectors'
import { baseNavigatorDepth, navigatorDepth } from '../navigator-utils'
import { ElementInstanceMetadataMap, JSXElementChild } from '../../../core/shared/element-template'
import {
  findMaybeConditionalExpression,
  getConditionalActiveCase,
  getConditionalCaseCorrespondingToBranchPath,
  isEmptyConditionalBranch,
  isNonEmptyConditionalBranch,
} from '../../../core/model/conditionals'
import { IndexPosition, after, before, front } from '../../../utils/utils'
import { assertNever } from '../../../core/shared/utils'
import { ElementPathTreeRoot } from '../../../core/shared/element-path-tree'
import { useAtom, atom } from 'jotai'
import { AlwaysFalse, usePubSubAtomReadOnly } from '../../../core/shared/atom-with-pub-sub'
import { Size } from '../../../core/shared/math-utils'

const WiggleUnit = BasePaddingUnit * 1.5

const DragSessionInProgressAtom = atom<boolean>(false)

export const TopDropTargetLineTestId = (safeComponentId: string): string =>
  `navigator-item-drop-before-${safeComponentId}`

export const BottomDropTargetLineTestId = (safeComponentId: string): string =>
  `navigator-item-drop-after-${safeComponentId}`

export const ReparentDropTargetTestId = (safeComponentId: string): string =>
  `navigator-item-${safeComponentId}`

export const DragItemTestId = (safeComponentId: string): string =>
  `navigator-item-drag-${safeComponentId}`

const BaseRowHeight = 35
const PreviewIconSize = BaseRowHeight

export interface DragSelection {
  elementPath: ElementPath
  index: number
}

export interface NavigatorItemDragAndDropWrapperPropsBase {
  index: number
  entryDepth: number
  appropriateDropTargetHint: DropTargetHint | null
  editorDispatch: EditorDispatch
  selected: boolean
  highlighted: boolean // TODO are we sure about this?
  collapsed: boolean // TODO are we sure about this?
  getCurrentlySelectedEntries: () => Array<NavigatorEntry>
  getSelectedViewsInRange: (index: number) => Array<ElementPath> // TODO remove me
  canReparentInto: boolean
  noOfChildren: number
  label: string
  isElementVisible: boolean
  renamingTarget: ElementPath | null
  windowStyle: React.CSSProperties
  visibleNavigatorTargets: Array<NavigatorEntry>
}

export interface NavigatorItemDragAndDropWrapperProps
  extends NavigatorItemDragAndDropWrapperPropsBase {
  elementPath: ElementPath
}

export interface SyntheticNavigatorItemContainerProps
  extends NavigatorItemDragAndDropWrapperPropsBase {
  elementPath: ElementPath
  childOrAttribute: JSXElementChild
}

export interface ConditionalClauseNavigatorItemContainerProps
  extends NavigatorItemDragAndDropWrapperPropsBase {
  navigatorEntry: ConditionalClauseNavigatorEntry
}

function isDroppingToOriginalPosition(
  metadata: ElementInstanceMetadataMap,
  elementPathTree: ElementPathTreeRoot,
  dropTargetHint: DropTargetHint,
  dropTargetElementPath: ElementPath,
  draggedElementPath: ElementPath,
): boolean {
  if (EP.pathsEqual(dropTargetElementPath, draggedElementPath)) {
    return true
  }

  const parentMatches = EP.pathsEqual(
    EP.parentPath(draggedElementPath),
    dropTargetHint.targetParent.elementPath,
  )
  if (!parentMatches) {
    // bail out if not dropping into the same parent
    return false
  }

  // dropping the element before itself
  const index = MetadataUtils.getIndexInParent(metadata, elementPathTree, draggedElementPath)
  if (
    dropTargetHint.targetIndexPosition.type === 'before' &&
    dropTargetHint.targetIndexPosition.index === index
  ) {
    return true
  }

  // dropping the element after the preceding entry
  if (
    dropTargetHint.targetIndexPosition.type === 'after' &&
    dropTargetHint.targetIndexPosition.index === index - 1
  ) {
    return true
  }

  // dropping to front and back
  const siblings = MetadataUtils.getSiblingsOrdered(metadata, elementPathTree, draggedElementPath)
  if (
    (dropTargetHint.targetIndexPosition.type === 'back' &&
      EP.pathsEqual(siblings.at(0)?.elementPath ?? null, draggedElementPath)) ||
    (dropTargetHint.targetIndexPosition.type === 'front' &&
      EP.pathsEqual(siblings.at(-1)?.elementPath ?? null, draggedElementPath))
  ) {
    return true
  }

  // absolute, for the sake of completeness
  if (
    dropTargetHint.targetIndexPosition.type === 'absolute' &&
    dropTargetHint.targetIndexPosition.index === index
  ) {
    return true
  }

  return false
}

function notDescendant(draggedOntoPath: ElementPath, draggedItemPath: ElementPath): boolean {
  return !EP.isDescendantOf(draggedOntoPath, draggedItemPath)
}

function safeIndexInParent(
  metadata: ElementInstanceMetadataMap,
  elementPathTree: ElementPathTreeRoot,
  elementPath: ElementPath,
): number | null {
  const index = MetadataUtils.getIndexInParent(metadata, elementPathTree, elementPath)
  return index < 0 ? null : index
}

function depthOfCommonAncestor(
  navigatorEntries: Array<NavigatorEntry>,
  hoveredNavigatorEntry: NavigatorEntry,
): number {
  const index = navigatorEntries.findIndex((e) => navigatorEntriesEqual(e, hoveredNavigatorEntry))
  if (index === navigatorEntries.length - 1) {
    return 0
  }

  const next = navigatorEntries[index + 1]
  const closestSharedAncestor = EP.closestSharedAncestor(
    hoveredNavigatorEntry.elementPath,
    next.elementPath,
    true,
  )

  if (closestSharedAncestor == null) {
    return 0
  }

  return baseNavigatorDepth(closestSharedAncestor)
}

function canDropInto(editorState: EditorState, moveToEntry: ElementPath): boolean {
  const notSelectedItem = editorState.selectedViews.every((selection) => {
    return !EP.isDescendantOfOrEqualTo(moveToEntry, selection)
  })

  const targetSupportsChildren = MetadataUtils.targetSupportsChildren(
    editorState.projectContents,
    editorState.jsxMetadata,
    editorState.nodeModules.files,
    editorState.canvas.openFile?.filename,
    moveToEntry,
  )
  return targetSupportsChildren && notSelectedItem
}

function canDropNextTo(editorState: EditorState, moveToEntry: ElementPath): boolean {
  const notSelectedItem = editorState.selectedViews.every((selection) => {
    return notDescendant(moveToEntry, selection)
  })

  const targetNotRootOfInstance = !EP.isRootElementOfInstance(moveToEntry)

  return notSelectedItem && targetNotRootOfInstance
}

function onDrop(
  propsOfDraggedItem: NavigatorItemDragAndDropWrapperProps,
  propsOfDropTargetItem: NavigatorItemDragAndDropWrapperProps,
  targetParent: ElementPath,
  indexPosition: IndexPosition,
  canvasSize: Size,
): Array<EditorAction> {
  const dragSelections = propsOfDraggedItem.getCurrentlySelectedEntries()
  const filteredSelections = dragSelections.filter((selection) =>
    notDescendant(propsOfDropTargetItem.elementPath, selection.elementPath),
  )
  const draggedElements = filteredSelections.map((selection) => selection.elementPath)

  return [
    reorderComponents(draggedElements, targetParent, indexPosition, canvasSize),
    hideNavigatorDropTargetHint(),
  ]
}

function getHintPaddingForDepth(depth: number): number {
  return (
    depth * BasePaddingUnit +
    ExpansionArrowWidth +
    PreviewIconSize / 2 -
    NavigatorHintCircleDiameter
  )
}

function onHoverDropTargetLine(
  propsOfDraggedItem: NavigatorItemDragAndDropWrapperProps,
  propsOfDropTargetItem: NavigatorItemDragAndDropWrapperProps,
  monitor: DropTargetMonitor | null,
  position: 'before' | 'after',
  metadata: ElementInstanceMetadataMap,
  navigatorEntries: Array<NavigatorEntry>,
  elementPathTree: ElementPathTreeRoot,
  isLastSibling: boolean,
): void {
  if (
    monitor == null ||
    !propsOfDraggedItem
      .getCurrentlySelectedEntries()
      .every((selection) =>
        notDescendant(propsOfDropTargetItem.elementPath, selection.elementPath),
      ) ||
    isHintDisallowed(propsOfDropTargetItem.elementPath, metadata)
  ) {
    return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
  }

  const cursor = monitor.getClientOffset()
  const cursorDelta = monitor.getDifferenceFromInitialOffset()
  const targetAction = propsOfDraggedItem.highlighted
    ? []
    : [EditorActions.setHighlightedView(propsOfDraggedItem.elementPath)]

  if (cursor == null || cursorDelta == null) {
    return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
  }

  const targetEntryWithReparentWiggle: {
    type: DropTargetType
    targetParent: NavigatorEntry
    indexPosition: IndexPosition
  } | null = (() => {
    if (cursorDelta.x >= -WiggleUnit || !isLastSibling || position === 'before') {
      return null
    }

    const commonAncestorDepth = depthOfCommonAncestor(
      navigatorEntries,
      regularNavigatorEntry(propsOfDropTargetItem.elementPath),
    )

    const maximumTargetDepth = propsOfDropTargetItem.entryDepth
    const cursorTargetDepth = 1 + Math.floor(Math.abs(cursorDelta.x) / WiggleUnit)

    const nPathPartsToDrop = Math.min(
      Math.min(cursorTargetDepth, maximumTargetDepth - commonAncestorDepth),
      maximumTargetDepth,
    )
    const targetParentPath = EP.dropNPathParts(propsOfDropTargetItem.elementPath, nPathPartsToDrop)
    const targetPathWithinParent = EP.dropNPathParts(
      propsOfDropTargetItem.elementPath,
      nPathPartsToDrop - 1,
    )

    const indexPositionFn =
      position === 'after' ? after : position === 'before' ? before : assertNever(position)

    const index = MetadataUtils.getIndexInParent(metadata, elementPathTree, targetPathWithinParent)

    if (index == null) {
      return null
    }

    return {
      type: 'after',
      targetParent: regularNavigatorEntry(targetParentPath),
      indexPosition: indexPositionFn(index),
    }
  })()

  if (targetEntryWithReparentWiggle != null) {
    return propsOfDraggedItem.editorDispatch([
      ...targetAction,
      showNavigatorDropTargetHint(
        targetEntryWithReparentWiggle.type,
        targetEntryWithReparentWiggle.targetParent,
        regularNavigatorEntry(propsOfDropTargetItem.elementPath),
        targetEntryWithReparentWiggle.indexPosition,
      ),
    ])
  }

  if (
    propsOfDraggedItem.appropriateDropTargetHint?.type !== position ||
    !navigatorEntriesEqual(
      propsOfDraggedItem.appropriateDropTargetHint?.displayAtEntry,
      regularNavigatorEntry(propsOfDropTargetItem.elementPath),
    )
  ) {
    const indexPositionFn =
      position === 'after' ? after : position === 'before' ? before : assertNever(position)

    const index =
      safeIndexInParent(metadata, elementPathTree, propsOfDropTargetItem.elementPath) ?? 0

    return propsOfDraggedItem.editorDispatch(
      [
        ...targetAction,
        showNavigatorDropTargetHint(
          position,
          regularNavigatorEntry(EP.parentPath(propsOfDropTargetItem.elementPath)),
          regularNavigatorEntry(propsOfDropTargetItem.elementPath),
          indexPositionFn(index),
        ),
      ],
      'leftpane',
    )
  }

  return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
}

function onHoverParentOutline(
  propsOfDraggedItem: NavigatorItemDragAndDropWrapperProps,
  propsOfDropTargetItem: NavigatorItemDragAndDropWrapperProps,
  monitor: DropTargetMonitor | null,
): void {
  if (
    monitor == null ||
    !propsOfDraggedItem
      .getCurrentlySelectedEntries()
      .every((selection) => notDescendant(propsOfDropTargetItem.elementPath, selection.elementPath))
  ) {
    return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
  }

  const cursor = monitor.getClientOffset()
  const cursorDelta = monitor.getDifferenceFromInitialOffset()
  const targetAction = propsOfDraggedItem.highlighted
    ? []
    : [EditorActions.setHighlightedView(propsOfDraggedItem.elementPath)]

  if (cursor == null || cursorDelta == null) {
    return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
  }

  const { canReparentInto } = propsOfDropTargetItem

  if (canReparentInto) {
    return propsOfDraggedItem.editorDispatch([
      ...targetAction,
      showNavigatorDropTargetHint(
        'reparent',
        regularNavigatorEntry(propsOfDropTargetItem.elementPath),
        regularNavigatorEntry(propsOfDropTargetItem.elementPath),
        front(),
      ),
    ])
  }

  return propsOfDraggedItem.editorDispatch([hideNavigatorDropTargetHint()], 'leftpane')
}

function beginDrag(
  props: NavigatorItemDragAndDropWrapperProps,
): NavigatorItemDragAndDropWrapperProps {
  if (!props.selected) {
    props.editorDispatch(MetaActions.selectComponents([props.elementPath], false), 'leftpane')
  }
  return props
}

interface DropCollectedProps {
  isOver: boolean
  canDrop: boolean
}

function isInsideConditional(elementPath: ElementPath, jsxMetadata: ElementInstanceMetadataMap) {
  return findMaybeConditionalExpression(EP.parentPath(elementPath), jsxMetadata) != null
}

function isHintDisallowed(elementPath: ElementPath | null, metadata: ElementInstanceMetadataMap) {
  return elementPath == null || isInsideConditional(elementPath, metadata) // don't show top / bottom hints on elements that are the root of a conditional branch
}

export const NavigatorItemContainer = React.memo((props: NavigatorItemDragAndDropWrapperProps) => {
  const editorStateRef = useRefEditorState((store) => store.editor)
  const canvasSize = usePubSubAtomReadOnly(CanvasSizeAtom, AlwaysFalse)

  const [isDragSessionInProgress, updateDragSessionInProgress] = useAtom(DragSessionInProgressAtom)

  const [, drag, preview] = useDrag(
    () => ({
      type: 'NAVIGATOR_ITEM',
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      item: () => {
        updateDragSessionInProgress(true)
        return beginDrag(props)
      },
      end: () => updateDragSessionInProgress(false),
      canDrag: () => {
        const editorState = editorStateRef.current
        return isAllowedToReparent(
          editorState.projectContents,
          editorState.jsxMetadata,
          props.elementPath,
        )
      },
    }),
    [props, updateDragSessionInProgress],
  )

  const metadata = useEditorState(
    Substores.metadata,
    metadataSelector,
    'NavigatorItemContainer metadata',
  )

  const elementPathTree = useEditorState(
    Substores.metadata,
    (store) => store.editor.elementPathTree,
    'NavigatorItemDndWrapper elementPathTree',
  )

  const dropTargetHint = useEditorState(
    Substores.navigator,
    (store) => store.editor.navigator.dropTargetHint,
    'NavigatorItemDndWrapper moveToElementPath',
  )

  const navigatorTargets = useEditorState(
    Substores.derived,
    (store) => store.derived.navigatorTargets,
    'NavigatorItemDndWrapper moveToElementPath',
  )

  const isFirstSibling = React.useMemo(() => {
    const siblings = MetadataUtils.getSiblingsOrdered(metadata, elementPathTree, props.elementPath)
    const firstSibling = siblings.at(0)
    if (firstSibling == null) {
      return false
    }

    return EP.pathsEqual(firstSibling.elementPath, props.elementPath)
  }, [metadata, elementPathTree, props.elementPath])

  const isLastSibling = React.useMemo(() => {
    const siblings = MetadataUtils.getSiblingsOrdered(metadata, elementPathTree, props.elementPath)
    const lastSibling = siblings.at(-1)
    if (lastSibling == null) {
      return false
    }

    return EP.pathsEqual(lastSibling.elementPath, props.elementPath)
  }, [metadata, elementPathTree, props.elementPath])

  const [{ isOver: isOverBottomHint, canDrop: canDropOnBottomHint }, bottomDropRef] = useDrop<
    NavigatorItemDragAndDropWrapperProps,
    unknown,
    DropCollectedProps
  >(
    () => ({
      accept: 'NAVIGATOR_ITEM',
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
      hover: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        onHoverDropTargetLine(
          item,
          props,
          monitor,
          'after',
          editorStateRef.current.jsxMetadata,
          navigatorTargets,
          elementPathTree,
          isLastSibling,
        )
      },
      drop: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        if (
          dropTargetHint != null &&
          !isDroppingToOriginalPosition(
            editorStateRef.current.jsxMetadata,
            elementPathTree,
            dropTargetHint,
            props.elementPath,
            item.elementPath,
          )
        ) {
          props.editorDispatch(
            onDrop(
              item,
              props,
              dropTargetHint.targetParent.elementPath,
              dropTargetHint.targetIndexPosition,
              canvasSize,
            ),
          )
        }
      },
      canDrop: (item: NavigatorItemDragAndDropWrapperProps) => {
        const target = props.elementPath
        return canDropNextTo(editorStateRef.current, target)
      },
    }),
    [props, elementPathTree, dropTargetHint, isLastSibling],
  )

  const [{ isOver: isOverTopHint, canDrop: canDropOnTopHint }, topDropRef] = useDrop<
    NavigatorItemDragAndDropWrapperProps,
    unknown,
    DropCollectedProps
  >(
    () => ({
      accept: 'NAVIGATOR_ITEM',
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
      hover: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        onHoverDropTargetLine(
          item,
          props,
          monitor,
          'before',
          editorStateRef.current.jsxMetadata,
          navigatorTargets,
          elementPathTree,
          isLastSibling,
        )
      },
      drop: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        if (
          dropTargetHint != null &&
          !isDroppingToOriginalPosition(
            editorStateRef.current.jsxMetadata,
            elementPathTree,
            dropTargetHint,
            props.elementPath,
            item.elementPath,
          )
        ) {
          props.editorDispatch(
            onDrop(
              item,
              props,
              dropTargetHint.targetParent.elementPath,
              dropTargetHint.targetIndexPosition,
              canvasSize,
            ),
          )
        }
      },
      canDrop: (item: NavigatorItemDragAndDropWrapperProps) => {
        const target = props.elementPath
        return canDropNextTo(editorStateRef.current, target)
      },
    }),
    [props, elementPathTree, dropTargetHint, isLastSibling],
  )

  const [{ canDrop: canDropParentOutline }, reparentDropRef] = useDrop<
    NavigatorItemDragAndDropWrapperProps,
    unknown,
    DropCollectedProps
  >(
    () => ({
      accept: 'NAVIGATOR_ITEM',
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
      hover: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        if (monitor.canDrop()) {
          onHoverParentOutline(item, props, monitor)
        }
      },
      drop: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
        if (monitor.canDrop() && dropTargetHint != null) {
          props.editorDispatch(
            onDrop(
              item,
              props,
              dropTargetHint.targetParent.elementPath,
              dropTargetHint.targetIndexPosition,
              canvasSize,
            ),
          )
        }
      },
      canDrop: (item: NavigatorItemDragAndDropWrapperProps) => {
        return canDropInto(editorStateRef.current, props.elementPath)
      },
    }),
    [props, dropTargetHint],
  )

  const safeComponentId = varSafeNavigatorEntryToKey(regularNavigatorEntry(props.elementPath))

  React.useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  })

  const shouldShowTopHint =
    isOverTopHint &&
    canDropOnTopHint &&
    !isHintDisallowed(dropTargetHint?.displayAtEntry?.elementPath ?? null, metadata)

  const isConditionalEntry = MetadataUtils.isConditionalFromMetadata(
    MetadataUtils.findElementByElementPath(metadata, props.elementPath),
  )

  const isCollapsedCondtionalEntry = isConditionalEntry ? props.collapsed : true

  const shouldShowBottomHint =
    isOverBottomHint &&
    canDropOnBottomHint &&
    !isHintDisallowed(props.elementPath, metadata) &&
    isCollapsedCondtionalEntry

  const margin = (() => {
    if (dropTargetHint == null) {
      return 0
    }

    return getHintPaddingForDepth(navigatorDepth(dropTargetHint.targetParent, metadata))
  })()

  const parentOutline = React.useMemo((): ParentOutline => {
    if (dropTargetHint == null || !canDropParentOutline) {
      return 'none'
    }

    const { targetParent } = dropTargetHint

    if (navigatorEntriesEqual(regularNavigatorEntry(props.elementPath), targetParent)) {
      return 'solid'
    }

    return 'none'
  }, [dropTargetHint, canDropParentOutline, props.elementPath])

  // Drop target lines should only intercept mouse events if a drag session is in progress
  const shouldTopDropLineInterceptMouseEvents = isDragSessionInProgress

  // in addition, if this entry is a conditional, the bottom drop target line should only be active when
  // the it's toggled closed (since otherwise the drop line would show up between the entry and the TRUE
  // entry underneath)
  const shouldBottomDropLineInterceptMouseEvents =
    isDragSessionInProgress && isCollapsedCondtionalEntry

  const navigatorEntry = React.useMemo(
    () => regularNavigatorEntry(props.elementPath),
    [props.elementPath],
  )

  return (
    <div
      data-testid={DragItemTestId(safeComponentId)}
      ref={drag}
      style={{
        ...props.windowStyle,
      }}
    >
      {when(
        isFirstSibling,
        <NavigatorHintTop
          testId={TopDropTargetLineTestId(safeComponentId)}
          ref={topDropRef}
          shouldBeShown={shouldShowTopHint}
          shouldAcceptMouseEvents={shouldTopDropLineInterceptMouseEvents}
          margin={margin}
        />,
      )}
      <div
        ref={reparentDropRef}
        key='navigatorItem'
        id={`navigator-item-${safeComponentId}`}
        data-testid={ReparentDropTargetTestId(safeComponentId)}
      >
        <NavigatorItem
          navigatorEntry={navigatorEntry}
          index={props.index}
          getSelectedViewsInRange={props.getSelectedViewsInRange}
          noOfChildren={props.noOfChildren}
          label={props.label}
          dispatch={props.editorDispatch}
          isHighlighted={props.highlighted}
          isElementVisible={props.isElementVisible}
          renamingTarget={props.renamingTarget}
          collapsed={props.collapsed}
          selected={props.selected}
          parentOutline={parentOutline}
          visibleNavigatorTargets={props.visibleNavigatorTargets}
        />
      </div>
      <NavigatorHintBottom
        testId={BottomDropTargetLineTestId(safeComponentId)}
        ref={bottomDropRef}
        shouldBeShown={shouldShowBottomHint}
        shouldAcceptMouseEvents={shouldBottomDropLineInterceptMouseEvents}
        margin={margin}
      />
    </div>
  )
})

function maybeSetConditionalOverrideOnDrop(
  elementPath: ElementPath,
  jsxMetadata: ElementInstanceMetadataMap,
  spyMetadata: ElementInstanceMetadataMap,
): Array<EditorAction> {
  if (!isEmptyConditionalBranch(elementPath, jsxMetadata)) {
    return []
  }

  const conditionalPath = EP.parentPath(elementPath)

  const conditional = findMaybeConditionalExpression(conditionalPath, jsxMetadata)
  if (conditional == null) {
    return []
  }

  const clause = getConditionalCaseCorrespondingToBranchPath(elementPath, jsxMetadata)

  const activeCase = getConditionalActiveCase(conditionalPath, conditional, spyMetadata)
  if (activeCase === clause) {
    return []
  }

  return [
    EditorActions.setConditionalOverriddenCondition(
      conditionalPath,
      clause === 'true-case' ? true : false,
    ),
  ]
}

export const SyntheticNavigatorItemContainer = React.memo(
  (props: SyntheticNavigatorItemContainerProps) => {
    const editorStateRef = useRefEditorState((store) => store.editor)
    const canvasSize = usePubSubAtomReadOnly(CanvasSizeAtom, AlwaysFalse)

    const [, updateDragSessionInProgress] = useAtom(DragSessionInProgressAtom)

    const navigatorEntry = React.useMemo(
      () => syntheticNavigatorEntry(props.elementPath, props.childOrAttribute),
      [props.childOrAttribute, props.elementPath],
    )

    const [{ isOver }, reparentDropRef] = useDrop<
      NavigatorItemDragAndDropWrapperProps,
      unknown,
      DropCollectedProps
    >(
      () => ({
        accept: 'NAVIGATOR_ITEM',
        collect: (monitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
        hover: (item: NavigatorItemDragAndDropWrapperProps, monitor) => {
          onHoverParentOutline(item, props, monitor)
        },
        drop: (item: NavigatorItemDragAndDropWrapperProps): void => {
          const { jsxMetadata, spyMetadata } = editorStateRef.current
          props.editorDispatch([
            ...onDrop(item, props, props.elementPath, front(), canvasSize),
            ...maybeSetConditionalOverrideOnDrop(props.elementPath, jsxMetadata, spyMetadata),
          ])
        },
        canDrop: () => {
          const metadata = editorStateRef.current.jsxMetadata
          return isEmptyConditionalBranch(props.elementPath, metadata)
        },
      }),
      [props, navigatorEntry],
    )

    const [, drag, preview] = useDrag(
      () => ({
        type: 'NAVIGATOR_ITEM',
        collect: (monitor) => ({
          isDragging: monitor.isDragging(),
        }),
        item: () => {
          updateDragSessionInProgress(true)
          return beginDrag(props)
        },
        end: () => updateDragSessionInProgress(false),
        canDrag: () =>
          isNonEmptyConditionalBranch(props.elementPath, editorStateRef.current.jsxMetadata),
      }),
      [props],
    )

    React.useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true })
    })

    const parentOutline = isOver ? 'child' : 'none'
    const safeComponentId = varSafeNavigatorEntryToKey(navigatorEntry)
    return (
      <div
        data-testid={DragItemTestId(safeComponentId)}
        ref={drag}
        style={{
          ...props.windowStyle,
        }}
      >
        <div
          ref={reparentDropRef}
          key='navigatorItem'
          id={`navigator-item-${safeComponentId}`}
          data-testid={`navigator-item-${safeComponentId}`}
        >
          <NavigatorItem
            navigatorEntry={navigatorEntry}
            index={props.index}
            getSelectedViewsInRange={props.getSelectedViewsInRange}
            noOfChildren={props.noOfChildren}
            label={props.label}
            dispatch={props.editorDispatch}
            isHighlighted={props.highlighted}
            isElementVisible={props.isElementVisible}
            renamingTarget={props.renamingTarget}
            collapsed={props.collapsed}
            selected={props.selected}
            parentOutline={parentOutline}
            visibleNavigatorTargets={props.visibleNavigatorTargets}
          />
        </div>
      </div>
    )
  },
)

export const ConditionalClauseNavigatorItemContainer = React.memo(
  (props: ConditionalClauseNavigatorItemContainerProps) => {
    const safeComponentId = varSafeNavigatorEntryToKey(props.navigatorEntry)
    return (
      <div
        style={{
          ...props.windowStyle,
        }}
      >
        <div
          key='navigatorItem'
          id={`navigator-item-${safeComponentId}`}
          data-testid={`navigator-item-${safeComponentId}`}
        >
          <NavigatorItem
            navigatorEntry={props.navigatorEntry}
            index={props.index}
            getSelectedViewsInRange={props.getSelectedViewsInRange}
            noOfChildren={props.noOfChildren}
            label={props.label}
            dispatch={props.editorDispatch}
            isHighlighted={props.highlighted}
            isElementVisible={props.isElementVisible}
            renamingTarget={props.renamingTarget}
            collapsed={props.collapsed}
            selected={props.selected}
            parentOutline={'none'}
            visibleNavigatorTargets={props.visibleNavigatorTargets}
          />
        </div>
      </div>
    )
  },
)
