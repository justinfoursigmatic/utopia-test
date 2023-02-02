import { MetadataUtils } from '../../../core/model/element-metadata-utils'
import { ElementInstanceMetadataMap } from '../../../core/shared/element-template'
import { ElementPath } from '../../../core/shared/project-file-types'
import * as PP from '../../../core/shared/property-path'
import { CanvasCommand } from '../../canvas/commands/commands'
import { deleteProperties } from '../../canvas/commands/delete-properties-command'
import { setProperty } from '../../canvas/commands/set-property-command'
import { nullOrNonEmpty } from '../inspector-common'
import { InspectorStrategy } from './inspector-strategy'

type InnerStrategy = (
  metadata: ElementInstanceMetadataMap,
  selectedElementPaths: ElementPath,
) => Array<CanvasCommand>

const mapInspectorStrategy =
  (innerStrategy: InnerStrategy): InspectorStrategy['strategy'] =>
  (metadata, elementPaths) =>
    nullOrNonEmpty(elementPaths.flatMap((elementPath) => innerStrategy(metadata, elementPath)))

function setSpacingModePackedSingleElement(
  metadata: ElementInstanceMetadataMap,
  elementPath: ElementPath,
): Array<CanvasCommand> {
  if (
    !MetadataUtils.isFlexLayoutedContainer(
      MetadataUtils.findElementByElementPath(metadata, elementPath),
    )
  ) {
    return []
  }

  return [setProperty('always', elementPath, PP.create('style', 'justifyContent'), 'flex-start')]
}

export const setSpacingModePacked: InspectorStrategy = {
  name: 'Set spacing mode to packed',
  strategy: mapInspectorStrategy(setSpacingModePackedSingleElement),
}

function setSpacingModeSpaceBetweenSingleElement(
  metadata: ElementInstanceMetadataMap,
  elementPath: ElementPath,
): Array<CanvasCommand> {
  if (
    !MetadataUtils.isFlexLayoutedContainer(
      MetadataUtils.findElementByElementPath(metadata, elementPath),
    )
  ) {
    return []
  }

  return [
    deleteProperties('always', elementPath, [PP.create('style', 'gap')]),
    setProperty('always', elementPath, PP.create('style', 'justifyContent'), 'space-between'),
  ]
}

export const setSpacingModeSpaceBetween: InspectorStrategy = {
  name: 'Set spacing mode to packed',
  strategy: mapInspectorStrategy(setSpacingModeSpaceBetweenSingleElement),
}
