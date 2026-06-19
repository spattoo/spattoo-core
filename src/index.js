export { default as CakeDesigner } from './designer/CakeDesigner.jsx';
export { default as PatternBuilder } from './designer/PatternBuilder.jsx';
export { default as PatternBuilderCanvas, placementPosition, getOverlappingIds, ALL_TIER_GEOM } from './designer/canvas/PatternBuilderCanvas.jsx';
export { default as CakeCanvas, CakeThumbnailCanvas } from './designer/canvas/CakeCanvas.jsx';
export { default as CreateTemplate } from './admin/CreateTemplate.jsx';
export { default as CustomerStorefront } from './storefront/CustomerStorefront.jsx';
export { default as AuthGate } from './auth/AuthGate.jsx';
export { useCakeDesign, TIER_RADII, FROSTING_TYPES } from './designer/hooks/useCakeDesign.js';
export { extractFromPhoto } from './designer/hooks/useExtractElements.js';
export { ZONES, PLACEMENT_MODES, ELEMENT_KINDS, ELEMENT_SLUGS } from './designer/constants.js';
// Cream finish/texture registry + the wall-geometry algorithms — exported so the admin texture
// calibrator authors against the SAME code the designer renders (no duplicated displacement maths).
export { CREAM_STYLES, STYLE_ORDER, DEFAULT_STYLE, styleDef, styleParamSchema, userStyleParams, resolveStyleParams, frostingStyleTypes, applyTextureConfig } from './designer/creamStyles.js';
export { buildStyledWall, displaceByHeightField } from './designer/geometry/creamWall.js';
export { getRusticNormalMap } from './designer/shared/textures/rusticTexture.js';
export { normalMapFromImage, loadNormalMapFromUrl, loadStrokeMaps, composeStrokeTile, heightFieldFromImage, heightTextureFromField, normalTextureFromField } from './designer/shared/textures/imageNormalMap.js';
