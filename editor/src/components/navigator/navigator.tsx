/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
import React from 'react'
import * as EP from '../../core/shared/element-path'
import Utils from '../../utils/utils'
import { setFocus } from '../common/actions'
import { ElementPath } from '../../core/shared/project-file-types'
import { clearHighlightedViews, showContextMenu } from '../editor/actions/action-creators'
import { DragSelection } from './navigator-item/navigator-item-dnd-container'
import { NavigatorItemWrapper } from './navigator-item/navigator-item-wrapper'
import { Substores, useEditorState, useRefEditorState } from '../editor/store/store-hook'
import { ElementContextMenu } from '../element-context-menu'
import { createDragSelections } from '../../templates/editor-navigator'
import { FixedSizeList, ListChildComponentProps } from 'react-window'
import AutoSizer, { Size } from 'react-virtualized-auto-sizer'
import { Section, SectionBodyArea, FlexColumn } from '../../uuiui'
import { last } from '../../core/shared/array-utils'
import { UtopiaTheme } from '../../uuiui/styles/theme/utopia-theme'
import { useKeepReferenceEqualityIfPossible } from '../../utils/react-performance'
import { useDispatch } from '../editor/store/dispatch-context'
import { css } from '@emotion/react'
import { isRegularNavigatorEntry, navigatorEntryToKey } from '../editor/store/editor-state'

interface ItemProps extends ListChildComponentProps {}

const Item = React.memo(({ index, style }: ItemProps) => {
  const visibleNavigatorTargets = useEditorState(
    Substores.derived,
    (store) => {
      return store.derived.visibleNavigatorTargets
    },
    'Item visibleNavigatorTargets',
  )
  const editorSliceRef = useRefEditorState((store) => {
    const dragSelections = createDragSelections(
      store.derived.navigatorTargets,
      store.editor.selectedViews,
    )
    return {
      selectedViews: store.editor.selectedViews,
      navigatorTargets: store.derived.navigatorTargets,
      dragSelections: dragSelections,
    }
  })

  const getDragSelections = React.useCallback((): Array<DragSelection> => {
    return editorSliceRef.current.dragSelections
  }, [editorSliceRef])

  // Used to determine the views that will be selected by starting with the last selected item
  // and selecting everything from there to `targetIndex`.
  const getSelectedViewsInRange = React.useCallback(
    (targetIndex: number): Array<ElementPath> => {
      const selectedItemIndexes = editorSliceRef.current.selectedViews
        .map((selection) =>
          editorSliceRef.current.navigatorTargets.findIndex(
            (entry) =>
              isRegularNavigatorEntry(entry) && EP.pathsEqual(entry.elementPath, selection),
          ),
        )
        .sort((a, b) => a - b)
      const lastSelectedItemIndex = last(selectedItemIndexes)
      if (lastSelectedItemIndex == null) {
        const lastSelectedItem = editorSliceRef.current.navigatorTargets[targetIndex]
        if (isRegularNavigatorEntry(lastSelectedItem)) {
          return [lastSelectedItem.elementPath]
        } else {
          return []
        }
      } else {
        let start = 0
        let end = 0
        if (targetIndex > lastSelectedItemIndex) {
          start = selectedItemIndexes[0]
          end = targetIndex
        } else if (targetIndex < lastSelectedItemIndex && targetIndex > selectedItemIndexes[0]) {
          start = selectedItemIndexes[0]
          end = targetIndex
        } else {
          start = targetIndex
          end = lastSelectedItemIndex
        }
        let selectedViewTargets: Array<ElementPath> = editorSliceRef.current.selectedViews
        Utils.fastForEach(editorSliceRef.current.navigatorTargets, (item, itemIndex) => {
          if (itemIndex >= start && itemIndex <= end && isRegularNavigatorEntry(item)) {
            selectedViewTargets = EP.addPathIfMissing(item.elementPath, selectedViewTargets)
          }
        })
        return selectedViewTargets
      }
    },
    [editorSliceRef],
  )

  const targetEntry = visibleNavigatorTargets[index]
  const componentKey = navigatorEntryToKey(targetEntry)
  const deepKeptStyle = useKeepReferenceEqualityIfPossible(style)
  return (
    <NavigatorItemWrapper
      key={componentKey}
      index={index}
      targetComponentKey={componentKey}
      navigatorEntry={targetEntry}
      getDragSelections={getDragSelections}
      getSelectedViewsInRange={getSelectedViewsInRange}
      windowStyle={deepKeptStyle}
    />
  )
})

export const NavigatorContainerId = 'navigator'

export const NavigatorComponent = React.memo(() => {
  const dispatch = useDispatch()
  const { minimised, visibleNavigatorTargets, selectionIndex } = useEditorState(
    Substores.fullStore,
    (store) => {
      const selectedViews = store.editor.selectedViews
      const innerVisibleNavigatorTargets = store.derived.visibleNavigatorTargets
      const innerSelectionIndex =
        selectedViews == null
          ? -1
          : innerVisibleNavigatorTargets.findIndex((entry) => {
              return (
                isRegularNavigatorEntry(entry) && EP.pathsEqual(entry.elementPath, selectedViews[0])
              )
            })
      return {
        minimised: store.editor.navigator.minimised,
        visibleNavigatorTargets: innerVisibleNavigatorTargets,
        selectionIndex: innerSelectionIndex,
      }
    },
    'NavigatorComponent',
  )

  const itemListRef = React.createRef<FixedSizeList>()

  React.useEffect(() => {
    if (selectionIndex > 0) {
      itemListRef.current?.scrollToItem(selectionIndex)
    }
  }, [selectionIndex, itemListRef])

  const onFocus = React.useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      dispatch([setFocus('navigator')])
    },
    [dispatch],
  )

  const onMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      dispatch([clearHighlightedViews()], 'everyone')
    },
    [dispatch],
  )

  const onContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      dispatch([showContextMenu('context-menu-navigator', event.nativeEvent)], 'everyone')
    },
    [dispatch],
  )

  const ItemList = (size: Size) => {
    if (size.height == null) {
      return null
    } else {
      return (
        <FixedSizeList
          ref={itemListRef}
          width={'100%'}
          height={size.height}
          itemSize={UtopiaTheme.layout.rowHeight.smaller}
          itemCount={visibleNavigatorTargets.length}
          layout={'vertical'}
          style={{ overflowX: 'hidden' }}
        >
          {Item}
        </FixedSizeList>
      )
    }
  }

  return (
    <Section
      data-name='Navigator'
      onFocus={onFocus}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      id={NavigatorContainerId}
      data-testid={NavigatorContainerId}
      tabIndex={-1}
      css={{
        zIndex: 1,
        flexGrow: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        overscrollBehavior: 'contain',
        '--paneHoverOpacity': 0,
        '&:hover': {
          '--paneHoverOpacity': 1,
        },
      }}
    >
      <SectionBodyArea
        minimised={minimised}
        flexGrow={1}
        style={{
          flexGrow: 1,
          overscrollBehavior: 'contain',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
        }}
      >
        <ElementContextMenu contextMenuInstance={'context-menu-navigator'} />
        <FlexColumn
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: '100%',
            overflowX: 'hidden',
          }}
        >
          <AutoSizer
            disableWidth={true}
            style={{
              overscrollBehavior: 'contain',
              overflowX: 'hidden',
              height: '100%',
            }}
          >
            {ItemList}
          </AutoSizer>
        </FlexColumn>
      </SectionBodyArea>
    </Section>
  )
})
NavigatorComponent.displayName = 'NavigatorComponent'
