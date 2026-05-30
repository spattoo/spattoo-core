export { default as CakeDesigner } from './designer/CakeDesigner.jsx';
export { default as PatternBuilder } from './designer/PatternBuilder.jsx';
export { default as PatternBuilderCanvas, placementPosition, getOverlappingIds, ALL_TIER_GEOM } from './designer/canvas/PatternBuilderCanvas.jsx';
export { default as CakeCanvas, CakeThumbnailCanvas } from './designer/canvas/CakeCanvas.jsx';
export { default as CreateTemplate } from './admin/CreateTemplate.jsx';
export { default as AuthGate } from './auth/AuthGate.jsx';
export { useCakeDesign, TIER_RADII, FROSTING_TYPES } from './designer/hooks/useCakeDesign.js';
export { extractFromPhoto } from './designer/hooks/useExtractElements.js';
