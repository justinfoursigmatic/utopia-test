import createCachedSelector from 're-reselect'
import React, { CSSProperties } from 'react'
import { createSelector } from 'reselect'
import { FlexRow, Icn, Tooltip } from '../../uuiui'
import { applyCommandsAction } from '../editor/actions/action-creators'
import { useDispatch } from '../editor/store/dispatch-context'
import { Substores, useEditorState, useRefEditorState } from '../editor/store/store-hook'
import { MetadataSubstate } from '../editor/store/store-hook-substore-types'
import { metadataSelector, selectedViewsSelector } from './inpector-selectors'
import {
  detectFillHugFixedState,
  FixedHugFillMode,
  getFixedFillHugOptionsForElement,
  resizeToFillCommands,
  resizeToFitCommands,
  sizeToVisualDimensions,
} from './inspector-common'

export const ResizeToFitControlTestId = 'ResizeToFitControlTestId'
export const ResizeToFillControlTestId = 'ResizeToFillControlTestId'
export const ResizeToFixedControlTestId = 'ResizeToFixedControlTestId'

const isApplicableSelector = createCachedSelector(
  metadataSelector,
  selectedViewsSelector,
  (_: MetadataSubstate, mode: FixedHugFillMode) => mode,
  (metadata, selectedViews, mode) => {
    if (selectedViews.length < 1) {
      return false
    }
    const isApplicable =
      selectedViews.length > 0 &&
      getFixedFillHugOptionsForElement(metadata, selectedViews[0]).has(mode)
    const isAlreadyApplied =
      detectFillHugFixedState('horizontal', metadata, selectedViews[0])?.type === mode &&
      detectFillHugFixedState('vertical', metadata, selectedViews[0])?.type === mode
    return isApplicable && !isAlreadyApplied
  },
)((_, mode) => mode)

interface ResizeToFitControlProps {}

export const ResizeToFitControl = React.memo<ResizeToFitControlProps>(() => {
  const dispatch = useDispatch()
  const selectedViewsRef = useRefEditorState((store) => store.editor.selectedViews)

  const metadataRef = useRefEditorState((store) => store.editor.jsxMetadata)

  const isHugApplicable = useEditorState(
    Substores.metadata,
    (store) => isApplicableSelector(store, 'hug'),
    'ResizeToFitControl isHugApplicable',
  )

  const isFillApplicable = useEditorState(
    Substores.metadata,
    (store) => isApplicableSelector(store, 'fill'),
    'ResizeToFitControl isHugApplicable',
  )

  const onResizeToFit = React.useCallback(() => {
    const commands = resizeToFitCommands(metadataRef.current, selectedViewsRef.current)
    if (commands.length > 0) {
      dispatch([applyCommandsAction(commands)])
    }
  }, [dispatch, metadataRef, selectedViewsRef])

  const onResizeToFill = React.useCallback(() => {
    const commands = resizeToFillCommands(metadataRef.current, selectedViewsRef.current)
    if (commands.length > 0) {
      dispatch([applyCommandsAction(commands)])
    }
  }, [dispatch, metadataRef, selectedViewsRef])

  const onSetToFixedSize = React.useCallback(() => {
    const commands = selectedViewsRef.current.flatMap((e) =>
      sizeToVisualDimensions(metadataRef.current, e),
    )
    if (commands.length > 0) {
      dispatch([applyCommandsAction(commands)])
    }
  }, [dispatch, metadataRef, selectedViewsRef])

  const disabledStyles = (enabled: boolean): CSSProperties =>
    enabled
      ? { cursor: 'pointer' }
      : {
          cursor: 'pointer',
          opacity: 0.5,
          pointerEvents: 'none',
        }

  return (
    <FlexRow style={{ gap: 12 }}>
      <Tooltip title={'Resize to Fit'}>
        <div
          data-testid={ResizeToFitControlTestId}
          onClick={onResizeToFit}
          style={{ cursor: 'pointer', ...disabledStyles(isHugApplicable) }}
        >
          <Icn
            type='fitToChildren'
            color='main'
            category='layout/commands'
            width={18}
            height={18}
          />
        </div>
      </Tooltip>
      <Tooltip title={'Resize to Fill'}>
        <div
          data-testid={ResizeToFillControlTestId}
          onClick={onResizeToFill}
          style={{ cursor: 'pointer', ...disabledStyles(isFillApplicable) }}
        >
          <Icn type='growToParent' color='main' category='layout/commands' width={18} height={18} />
        </div>
      </Tooltip>
      <Tooltip title={'Fixed size'}>
        <div
          data-testid={ResizeToFixedControlTestId}
          onClick={onSetToFixedSize}
          style={{ cursor: 'pointer' }}
        >
          <Icn type='fixed' color='main' category='layout/commands' width={16} height={16} />
        </div>
      </Tooltip>
    </FlexRow>
  )
})
