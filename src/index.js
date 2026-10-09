export { default as CakeDesigner } from './designer/CakeDesigner.jsx';
export { default as PatternBuilder } from './designer/PatternBuilder.jsx';
export { default as PatternBuilderCanvas, placementPosition, getOverlappingIds, ALL_TIER_GEOM } from './designer/canvas/PatternBuilderCanvas.jsx';
export { default as CakeCanvas, CakeThumbnailCanvas, CakePreview } from './designer/canvas/CakeCanvas.jsx';
// One catalogue element on a cake, placed by the designer's OWN addSticker and drawn by its own
// scene — so the admin preview is a mount of the designer, not a second renderer that drifts.
// `zoneMode` rides along because a caller choosing a zone must resolve the element's mode the same
// way the designer does.
export { default as ElementPreview } from './designer/preview/ElementPreview.jsx';
export { zoneMode, zoneCfg, zoneSeat, zoneInsert } from './designer/placement.js';
// The shape picker's camera and its capture helper. Exported because the Cake Shape Studio SAVES a
// thumbnail through this exact view and the picker falls back to a live tile through it — one camera, or
// a shape would change appearance the moment somebody photographed it. captureThumbnailBlob is the ONE
// canvas→blob path (the same one order placement and template save use), not a second copy in admin.
export { shapeView } from './designer/controls/ShapePicker.jsx';
export { captureThumbnailBlob } from './designer/utils/thumbnail.js';
// The same crop, for a picture a PERSON supplies. Staff replace a template's thumbnail by
// photographing the cake in the designer and uploading the PNG, and an upload stored raw would sit
// in the grid framed differently from every captured one. Goes through captureThumbnailBlob.
export { thumbnailFromImage } from './designer/utils/thumbnail.js';

/* The cream pen's own geometry, so the ADMIN STUDIO renders what the cake renders.
 *
 * ⚠️ FreehandPenStudio carried its own copy of all of this — its own nozzles, its own sweep, its own
 * material — because it was the prototype this was ported FROM. The two then drifted, which makes it
 * a studio that tunes a renderer no customer ever sees: exactly the mock-up the root CLAUDE.md warns
 * about, and the drift INVARIANTS #15 exists to stop. `PEN_FEEL` is the tunable set it drives.
 */
export { buildPipingStroke, buildPipingHeap, mergePenGeometries, NOZZLES, NOZZLE_BY_KEY, DEFAULT_NOZZLE, PEN_FEEL }
  from './designer/geometry/creamPen.js';
/* What a piped shape is MADE OF, so a studio can dress one in the cake's own cream rather than in a
 * lookalike. `mediumOf(key).material({ softness }, colour)` is the exact call `CreamPen` makes on
 * every stroke and heap, and `creamMaterialProps` behind it carries the sheen and roughness curve
 * that make buttercream read as buttercream.
 *
 * ⚠️ EXPORTED RATHER THAN COPIED, and `PipingCalibrator` is why. That studio mirrors CakeTier's
 * maths locally under three separate "MUST stay identical to spattoo-core" warnings — a promise a
 * comment cannot keep. A material recipe is a shader curve, so it belongs in code (see the note in
 * pipingMedia.js) and therefore in ONE copy that both the cake and the studio import. */
export { MEDIA, DEFAULT_MEDIUM, mediumOf } from './designer/geometry/pipingMedia.js';
/* The metallic↔matte mapping, so a studio placing a pearl beside piped cream uses the SAME curve the
 * ball cluster's Finish control writes. One slider drives both PBR params together because a
 * believable metal needs high metalness AND low roughness — finish.js is the one place that pairing
 * lives, and a second copy in admin would be a pearl that drifts from the cake's own.
 *
 * ⚠️ A LEAF MODULE WITH NO IMPORTS, so unlike pipingMedia.js this cannot reach the env map and needs
 * no entry in check-env-map's accepted list. Worth stating: that gate fired on the last export in
 * this file and the difference is exactly this — what a module IMPORTS, not what it does. */
export { FINISH_METALLIC, FINISH_MATTE, finishToMaterial, finishOf } from './designer/geometry/finish.js';
export { default as CreateTemplate } from './admin/CreateTemplate.jsx';
export { default as CustomerStorefront } from './storefront/CustomerStorefront.jsx';
// Print a cake's decorations: the artwork for edible paper, and the traced outline as a template to
// cut fondant around. Exported because the host decides WHERE "Cut-outs" is reached from.
export { default as CutoutSheet } from './chefsdesk/CutoutSheet.jsx';
// Exported so the DESIGNER route can gate itself with the same verification the storefront uses,
// rather than growing a second OTP screen that drifts from this one. See the "one exception" note
// in VerifyStep.jsx for why that route asks at the door when nothing else does.
export { default as VerifyStep } from './storefront/facets/VerifyStep.jsx';
export { default as OrdersPanel } from './orders/OrdersPanel.jsx';
// What a notification link asks the baker app to open (?order= / ?panel=). Exported because the HOST
// reads the page address — as it already does ?session= — and must read it the way the bell does, not
// with a second parser that drifts from it.
export { parseNotificationLink, withoutLinkParams } from './notifications/notificationLink.js';
// Shared subscription-plan picker (select-to-expand) + pricing helpers — used by the billing
// screen AND the signup onboarding wizard so the plan catalog lives in ONE place (the DB), not
// duplicated per consumer.
export { default as PlanCards } from './billing/PlanCards.jsx';
export { periodPrice, formatPlanPrice, PERIOD_SUFFIX } from './billing/planPricing.js';
export { default as AuthGate } from './auth/AuthGate.jsx';
export { useCakeDesign, toCanvasConfig, TIER_RADII, FROSTING_TYPES } from './designer/hooks/useCakeDesign.js';
export { ZONES, PLACEMENT_MODES, ELEMENT_KINDS, ELEMENT_SLUGS } from './designer/constants.js';
// The cake's DEFAULT dimensions — the sizes core actually ships. Exported so a studio can start from
// the real cake instead of inventing numbers to tune against.
export { BOTTOM_H, TIER_HEIGHT_STEP, SHEET_SIZES, SHEET_DEFAULT_KEY, SHEET_INCH_TO_WORLD } from './designer/constants.js';
// The camera the CUSTOMER looks through. Exported because a tool that exists to judge a cake's
// proportions has to show them the way the customer will see them — and the Cake Shape Studio could not
// reach these, so it invented a lens of its own (a long 18° from a low angle) and every cake read TALLER
// there than on the cake it was authoring. Same class of bug as two definitions of a heart: a second
// camera is a second opinion about what the cake looks like.
export { CAMERA_FOV, CAMERA_POSITION } from './designer/constants.js';
// Piping-layer factory + placement resolver — exported so the admin inspiration preview builds the
// SAME tier topPipings/bottomPipings the live designer does (one factory, no drift — INVARIANTS #3).
export { makePipingLayer, pipingPlacementFromConfig } from './designer/piping/pipingLayer.js';
// 2D image pixel-recolour (the SAME function the designer runs) + the method registry — exported
// so the admin recolour tester / element authoring use the exact runtime logic, never a copy.
export { recolorImageData, RECOLOR_METHODS, dominantColor, dominantColorOfImage } from './designer/shared/color/imageRecolor.js';
// CORS-qualified asset URL — every canvas/WebGL read of an R2 asset must go through this or a
// non-CORS cache entry can poison the fetch (see utils/assetUrl.js). Exported so admin authoring
// surfaces that pixel-read an element's image use the ONE qualifier the designer uses, not a copy.
export { corsUrl } from './designer/utils/assetUrl.js';
// Print exposure — the ONE rule that decides how bright a 2D print renders. Exported so the admin studios
// build their preview material from the SAME function the cake does: a studio that computes its own print
// brightness WILL drift from the designer, and that drift is the original "vivid in the studio, dull on the
// cake" bug. Import it; never re-derive it.
export { printExposure, PRINT_NEUTRAL, REFERENCE_LIGHT, SHADING, SATURATION } from './designer/shared/printExposure.js';
// Cream finish/texture registry + the wall-geometry algorithms — exported so the admin texture
// calibrator authors against the SAME code the designer renders (no duplicated displacement maths).
export { CREAM_STYLES, STYLE_ORDER, DEFAULT_STYLE, styleDef, styleParamSchema, userStyleParams, resolveStyleParams, frostingStyleTypes, applyTextureConfig } from './designer/creamStyles.js';
// Decoration surface materials (satin, …) — the finish a PLACED decoration wears, resolved from
// placement_config.material. Exported so the admin materials screen can author/list them (materialsFor).
export { DECOR_MATERIALS, materialSurface, materialsFor, applyDecorMaterialConfig } from './designer/materials.js';
// Cake shapes — the footprint catalog (seed + DB overlay) and the outline kernel every shape-dependent
// operation derives from. The admin Cake Shape Studio authors rows against exactly these.
export { CAKE_SHAPES, applyCakeShapeConfig, cakeShapeDef, cakeShapeList } from './designer/cakeShapes.js';
/* Coating a whole cake in piped roses. PATHS, not meshes — the caller sweeps them with
   buildPipingStroke and welds them with mergePenGeometries, both of which already exist and are
   already tuned. Exported so the admin studio imports the packing rather than carrying a copy
   of it (CLAUDE.md: "the studio imports the geometry"). */
/* Measuring the spacing at which a given piece actually tiles without a hole. Every cheaper
   proxy — bounding box, √2·r, a percentile of vertices — was tried and each left visible cake,
   because a disc tiles at 0.81 of its width and a sharp star needs 0.54, and no constant is both. */
export { silhouette, tilesWithoutGaps, maxTileStep } from './designer/geometry/tileCoverage.js';
/* Which colour each piece of a coat takes — a PARAMETER per seat, not a colour. What a chosen
   colour looks like on cream is creamAlbedo's job; a second opinion here is the preview-versus-
   render drift INVARIANTS #15 exists to prevent. */
export { coatShade, COAT_SHADE_MODES, OMBRE_LID_SHARE } from './designer/geometry/coatShade.js';
export { rosetteSpiral, rosetteLocalPath, rosetteSeats, rosetteCoatPaths, ROSETTE_DEFAULTS } from './designer/geometry/rosetteCoat.js';
export { OUTLINE_FAMILIES, outlineOf, scaledOutline } from './designer/geometry/shapes.js';
/* The colour model (INVARIANTS #16): every surface rendering a CHOSEN colour divides its albedo by
 * the light it receives, with a reference light MEASURED per surface. Exported so admin studios —
 * which decide colour and must therefore show it truthfully — can apply the same correction the
 * cake does. */
export { albedoForLight } from './designer/shared/albedoForLight.js';
// Glyph-cake sizing — the per-character-count model shared by the `number` (digits) and `letter` (A–Z)
// families (a "1"/"A" and a "21"/"AB" size independently; every string of a given count renders
// identically). Exported so the Cake Shape Studio authors byCount against the SAME defaults + resolver the
// designer sizes with (one source, no drift), and previews the true footprint.
export {
  NUMBER_COUNTS, NUMBER_SIZE_DEFAULTS, numberDigitCount, numberSizeForCount, numberTierDims,
  LETTER_COUNTS, LETTER_SIZE_DEFAULTS, letterCount, letterSizeForCount, letterTierDims,
} from './designer/geometry/glyphShape.js';
export { tierShape, perimeter, boundingRadius, topContains, topClamp } from './designer/geometry/surface.js';
// Acrylic toppers: the word, its bar, its prongs — and the connectivity check that says whether the
// thing can be cut as one piece. Exported because the admin studio previews from the same numbers
// the designer renders, the same bargain TextTopperStudio already makes with the text-slot compositor.
export { topperShapes, pieceCount, components, bridgeLoose, offsetParts, backingPlate, followsBox } from './designer/geometry/topperShape.js';
// THE size control — the admin studios size a topper with the same dial the customer will.
export { SizeDial } from './designer/shared/SizeDial.jsx';
// THE colour control and THE scrolling row, for the same reason and by the same bargain. Admin
// studios had neither and reached for `<input type="color">` and a bare overflow div; both are
// breaches of rule 1 that could not be fixed while the components lived inside CakeDesigner.jsx.
export { ColorWheel } from './designer/shared/ColorWheel.jsx';
export { ScrollFadeRow } from './designer/shared/ScrollFadeRow.jsx';
// THE grid of cake templates — square picture-only tiles that reveal a page at a time. Exported
// because plans/baker-catalogue.md gives it three designer-side callers: the rail's Templates
// flyout, Settings → Spattoo templates (stocking the shop) and the catalogue's Edit mode. The
// storefront keeps its OWN gallery on purpose — captioned cards in the baker's palette, not the
// app's chrome — so this is not the one component for every template list, only for ours.
export { default as TemplateGrid } from './designer/shared/TemplateGrid.jsx';
// One face list and one finish list, shared by the studio and the cake. creamFonts.json is already
// copied into spattoo-admin; a topper does not get a second copy of anything.
export { TOPPER_FACES, DEFAULT_TOPPER_FACE, loadTopperFace, isMonoline, faceFit } from './designer/geometry/topperFaces.js';
export { TOPPER_FINISHES, DEFAULT_TOPPER_FINISH, topperFinish, applyTopperFinishConfig } from './designer/geometry/topperFinishes.js';
// ONE renderer for both places a topper goes — standing on the top, or lying flat on the side.
export { default as AcrylicWord } from './designer/canvas/AcrylicWord.jsx';
// Every acrylic number in one place — the seam a catalogue row reaches the cake through.
export { ACRYLIC_DEFAULTS, acrylicCfg, acrylicFitAspect, writingFromAcrylicRow, acrylicFinishes,
         NOMINAL_MM_PER_UNIT } from './designer/geometry/acrylicConfig.js';
export { buildStyledWall, buildStyledTop, displaceByHeightField, makeWallReliefSampler, ropeRadius, pipedBodyRadius, pipedParams } from './designer/geometry/creamWall.js';
// The tier TOP — the scraped edge and the turntable spiral. One builder for both, because they are
// two tools on one sheet of cream (see topCavity.js); exported so the admin studio tunes against the
// SAME code CakeTier renders, rather than a prototype copy that then has to be ported back.
export { buildTopSurface, buildTopCavity, cavityProfile, CAVITY_DEFAULTS } from './designer/geometry/topCavity.js';
export { spiralField, ridgeProfile, swirlPhase, SPIRAL_DEFAULTS, SPIRAL_RISE } from './designer/geometry/topSpiral.js';
// The bendable wire a butterfly floats on. The RANGES are exported, not just the defaults, because
// admin's Manage Elements offers the same numbers on its own form — and a hand-copied `max` there
// drifted the moment this one moved: core went to 88° and the admin field still read 20–75.
// One constant, both surfaces (root CLAUDE.md rule 1, and its note that a number on another surface
// is a dependency to state rather than a value to repeat).
export { ELEMENT_WIRE_DEFAULTS, WIRE_ANGLE, WIRE_LENGTH, WIRE_BEND, WIRE_WAVES, WIRE_TWIST, WIRE_SWEEP }
  from './designer/geometry/elementWire.js';
// Procedural chocolate-drip geometry — exported so the admin drip studio tunes against the SAME code
// the designer (CakeTier) renders (no duplicated drip maths).
export { buildBrushStrokeOnWall, buildBrushStrokeOnFlat, brushRelief, brushLoad, brushStriation,
         strokeFacesOutward, wallCoordsOf, grabOffset, dragStrokeTo, brushGestureFromDrag, brushTopPath, brushTopFromDrag, paintBrushColors,
         brushGesture, BRUSH_GESTURE_DEFAULTS, makeBrushBed,
         buildBrushBand, brushBandCount, BRUSH_BAND_DEFAULTS,
         BRUSH_ON_CAKE_DEFAULTS } from './designer/geometry/brushStrokeOnCake.js';
export { balloonProfile, buildBalloon, BALLOON_DEFAULTS, BALLOON_PLACEMENT_DEFAULTS, BALLOON_SIZE_RANGE,
         balloonPlacement, balloonHandleAt, balloonDragTo } from './designer/geometry/balloon.js';
export { waferPanel, buildWaferSkirt, WAFER_DEFAULTS } from './designer/geometry/waferPaper.js';
export { WAFER_PAPER_MATERIAL, waferFibreTexture } from './designer/geometry/waferPaperMaterial.js';
export { buildDripGeometry, buildDripWeb, DRIP_DEFAULTS, DRIP_WEB_OVERLAP, dripColorAt, paintDripColors, buildDripFlood, DRIP_SPLIT_DEFAULTS } from './designer/geometry/chocolateDrip.js';
// Piped grass (Wilton 233). Geometry + seats are separate on purpose: the renderer INSTANCES one
// tuft across thousands of seats, so the admin studio tunes the tuft and previews the field.
export { buildGrassTuft, grassSeats, grassTriangleCount, GRASS_DEFAULTS } from './designer/geometry/grass.js';
export { default as GrassPatch } from './designer/canvas/GrassPatch.jsx';

/* ── The pen's own stamp renderer, so a studio can calibrate the WALL ─────────────────────────────
 *
 * ⚠️ EXPORTED SO THE CALIBRATOR DOES NOT GROW A THIRD STAMP RENDERER. `side_rotation` is the wall's
 * attitude for a hand-piped piece, and it cannot be tuned against a ring preview: a ring keeps the
 * piece upright in world space and yaws it outward, while the pen aligns its up-axis to the surface
 * normal. Calibrating one against the other is how `stampRotationSide` came to be reading the
 * board's figure in the first place.
 *
 * This component already IS the answer — it prepares the GLB exactly as a ring does (`extractGeo`,
 * which bakes the +90° X turn), measures footprint/height/bbox the same way, and hands the lot to
 * `stampTransforms`. Its own header records what happened the last time a second preparation
 * existed: "a hand-piped shell started a quarter turn out from a ringed one, and every attempt to
 * fix the orientation by adjusting the ROTATION was correcting the wrong side of the difference."
 *
 * Safe on the public surface: it lights nothing (no SceneLights, no Environment), so `check:env-map`
 * has nothing to object to — unlike CakeTier.jsx, which is why `shellGeo.js` exists.
 */
/* Which build of the designer this is — so a catalogued template can say which renderer it needs.
 * Read `version` as "the version this code was last released AS": exact for a vendored tarball, a
 * floor for a working tree. Whether you are running source is the CONSUMER's to know — see the note
 * in buildId.js, and vite.config.js in admin, which derives it from the same existsSync that picks
 * the alias. plans/renderer-version-floor.md in spattoo-docs. */
export { BUILD } from './designer/buildId.js';

export { default as StampStroke } from './designer/canvas/StampStroke.jsx';
/* The height a ring normalises a shell to, as a fraction of the tier radius. Exported so a studio
   can size a hand-piped preview to match the rings beside it instead of picking a number: the pen
   sizes a `regular` stamp by HEIGHT (`target = 2 x thickness`), so `thickness = radius x
   SHELL_HEIGHT_FRAC / 2` puts a stamp and a ring shell at the same scale. INVARIANTS #8 — a studio
   must not hardcode a world dimension it can derive. */
export { SHELL_HEIGHT_FRAC } from './designer/canvas/pipingMetrics.js';
/* ⚠️ `stampTransforms` IS DELIBERATELY NOT EXPORTED BESIDE IT. Exporting it was speculative — the
   calibrator needs the COMPONENT, not the maths — and doing so immediately failed admin's
   `check:no-geometry-copy`, which found an older copy of the name in FreehandPenStudio.jsx:
   `stampTransforms(points, size, spacing, footprint, seed)` against core's `(stroke, metrics)`,
   with its own `surfaceNormalAt` and no rotation, lean or post-rotation seat. That copy predates
   this and is a real finding, but reconciling two different signatures is its own change with its
   own risk, and shipping an export nobody needs in order to force it is the wrong order. Export it
   when something here actually needs it, and port the studio in the same change. */
// The shipping light rig. Exported so an admin studio tunes a look under the SAME lights the designer
// renders it under — a colour picked beneath a brighter key is simply the wrong colour, and the
// designer's own rig carries a note about exactly that overexposure washing the cake top toward white.
/* The designer's rig, so a studio previewing cake output can mount exactly what the cake mounts
 * (INVARIANTS #17). `SceneBackground` and `DESIGNER_GROUND` are part of it: the ground is a SCENE
 * background, so it is in the render — a studio that paints a different colour behind a transparent
 * canvas is judging its subject against a surround no cake has. */
export { SceneLights, SceneEnv, SceneBackground } from './designer/canvas/CakeCanvas.jsx';
/* ⚠️ A HOST THAT MOUNTS SceneEnv MUST BE ABLE TO SAY WHERE THE MAP IS, and until this it could not.
   SceneLights and SceneEnv were both on this surface and `configureEnvMap` was not, so spattoo-admin
   — which mounts them in a dozen studios — had no way to reach it and every studio fell back to
   drei's indoor preset. Half an interface is how that went unnoticed: the studios looked compliant,
   `check:studio-scene` passed, and the lighting was wrong in all of them. */
export { configureEnvMap, envProps } from './designer/canvas/envMap.js';
/* THE cream material — one answer to "what does cream look like", so a studio cannot form a second
   opinion about it. From the LEAF module rather than from CakeTier: exporting it from there makes
   CakeTier an exported scene-lighting entry point and check:env-map rightly demands the HDRI. */
export { creamMaterialProps, creamAlbedo, PIPING_SOFTNESS_DEFAULT } from './designer/geometry/creamMaterial.js';
export { DESIGNER_GROUND, SELECTION_COLOR } from './designer/constants.js';
/* THE selection cue for a placed object (INVARIANTS #14). A border rather than a tint, because an
 * emissive highlight is additive and corrupts the very albedo it is advertising — which matters most
 * on a screen whose job is choosing colours. Exported so a studio shows selection the way the
 * designer does instead of inventing a second blue. */
export { default as SelectionBox } from './designer/canvas/SelectionBox.jsx';
/* The card-topper composer. A BAKER studio, so it ends the way GarnishStudio does — use it on the
 * cake, or keep it and use it — and it stores the OBJECT LIST rather than the geometry it builds. */
export { default as TopperComposer } from './designer/topper/TopperComposer.jsx';
/* ⚠️ ONE answer to "what shape is this topper", asked by the composer AND by the cake. A private copy
 * in either is two answers to one question, and the cake's is the one the customer sees. */
export { topperContours, topperSheets, topperBox } from './designer/geometry/topperPiece.js';
export { TOPPER_PRESETS, presetPaths } from './designer/topper/topperPresets.js';
// A fondant rainbow. Generated rather than modelled because its legs have to REACH the board, which
// is a different distance on every cake — the same argument the chocolate drip made for its radius.
// Everything it is given is a ratio of the cake, so one authored rainbow suits a 6" and a 10".
export { cloudLobes, cloudPlacement, cloudBaseY, cloudGuide, cloudOutline, cloudHandleAt, cloudDragTo, CLOUD_DEFAULTS } from './designer/geometry/cloud.js';
export { default as FondantCloud } from './designer/canvas/FondantCloud.jsx';
// Modelled fondant — a figure built from rolled pieces. The renderer and the parts model are
// exported together because the studio needs both: it edits the list and draws it with the same
// component the designer will, so what an author judges is what a customer sees.
export { default as FondantBuild } from './designer/canvas/FondantBuild.jsx';
// The 3D how-to-make-it: the same parts list replayed as a ball being rolled, shaped and pressed
// on. No new data — a piece is already a scaled primitive at a position, so the animation is the
// interpolation into it.
export { default as FondantGuide, piecesAfterStep as fondantPiecesAfterStep } from './designer/canvas/FondantGuide.jsx';
export { buildSteps as fondantBuildSteps, supportingPart as fondantSupportingPart } from './designer/geometry/fondantSteps.js';
export {
  SHAPES as FONDANT_SHAPES, SHAPE_ORDER as FONDANT_SHAPE_ORDER, PRESETS as FONDANT_PRESETS,
  defaultPart as fondantDefaultPart, expandParts as fondantExpandParts,
  restingY as fondantRestingY, settle as fondantSettle, buildBounds as fondantBounds,
  toConfig as fondantToConfig, FONDANT_BUILD_VERSION,
} from './designer/geometry/fondantParts.js';
export { RAINBOW_ARRANGEMENTS, ArrangementTile, arrangementOf, iconTiers } from './designer/decorations/RainbowArrangements.jsx';
export { rainbowBands, bandGeometry, bandPath, bandRadius, legFootY, archCenterX, requiredStandoff, rainbowBoardReach, rainbowFootReach, rainbowHandleAt, rainbowDragTo, wrapToWall, fitOnTopScale, rainbowGuide, springRange, RAINBOW_DEFAULTS } from './designer/geometry/rainbow.js';
export { default as RainbowArch } from './designer/canvas/RainbowArch.jsx';
// Fondant letter blocks. Layout is separate from the renderer for the same reason grass's is: one
// word in, N placements out, and nothing downstream owns a single block.
export { nameBlockLayout, nameBlockRun, nameBlockYaw, boardRunRadius, NAME_BLOCK_DEFAULTS } from './designer/geometry/nameBlocks.js';
export { default as NameBlocks } from './designer/canvas/NameBlocks.jsx';
// Solid relief slab geometry — exported so the admin Relief Sticker Studio previews the SAME extruded
// solid the designer renders for placement_config.relief.solid (one builder, no drift).
export { buildSolidReliefGeometry } from './designer/geometry/solidRelief.js';
// Solid-slab side-wall FINISHES (fondant/chocolate/…) + the shared wall-material factory — the studio
// authors relief.solidFinish from this ONE registry and previews the identical material (no drift).
export { SOLID_FINISHES, SOLID_FINISH_ORDER, DEFAULT_SOLID_FINISH, buildSolidWallMaterial } from './designer/geometry/solidFinishes.js';
// Editable text placeholders ({name}/{number} on a template topper) — the ONE renderer. The designer
// composites the customer's value with it and the admin Text Topper Studio previews + bakes the artwork
// with the very same functions, so the authoring preview and the cake can never disagree.
export {
  TEXT_SLOT_KINDS, DEFAULT_TEXT_STYLE, ALGORITHMS as TEXT_ALGORITHMS, resolveStyle as resolveTextStyle,
  loadStyleFont, loadSlotFonts, renderTextSlot, drawTextSlots, composeTextTopper,
  applyPatches, coverPatches, bakeArtwork, findCleanSource, findInkColor,
} from './designer/shared/textures/textSlots.js';
export { TEXT_STYLES, applyTextStyleConfig, textStyleOf } from './designer/textStyles.js';
// The calendar recipe — a month grid with one date ringed, GENERATED rather than uploaded. Same
// one-renderer rule as text slots above: the admin Calendar Studio previews and bakes its thumbnail
// with these, the designer composites the cake texture with them, and the X-Ray print sheet will
// draw from them too. A baker must never print a different calendar from the one the customer saw.
export {
  CALENDAR_DEFAULTS, CALENDAR_VALUE_KEYS, DAY_INITIALS, MONTH_NAMES as CALENDAR_MONTH_NAMES,
  daysInMonth, firstWeekday, resolveDate, calendarLayout, drawCalendar, composeCalendar,
  // The extent rule, so the studio authors `placement_config.sheet` from the same numbers the
  // renderer paints with rather than a constant someone typed twice.
  calendarSheet, CALENDAR_DISC_INSET,
} from './designer/shared/textures/calendarArt.js';
export { getRusticNormalMap } from './designer/shared/textures/rusticTexture.js';
// Shared fondant-grain normal — the SAME matte surface the cake wall carries, reused by the Relief
// Studio so the solid-slab side walls preview identically to the designer (one texture, no drift).
export { getFondantNormalMap } from './designer/shared/textures/fondantTexture.js';
export { getWeaveNormalMap, makeWeaveField, weaveTiles } from './designer/shared/textures/weaveStencilTexture.js';
export { makeLusterDustMaps, LUSTER_DUST_DEFAULTS, LUSTER_DUST_NEW_SPLASH } from './designer/shared/textures/lusterDust.js';
export { makeParticleFinishMaps } from './designer/shared/textures/particleFinish.js';
export { GOLD_LEAF_DEFAULTS, GOLD_LEAF_NEW_FLAKE, GOLD_LEAF_COLORS } from './designer/shared/textures/goldLeafFlakes.js';
export { normalMapFromImage, loadNormalMapFromUrl, loadStrokeMaps, composeStrokeTile, heightFieldFromImage, heightTextureFromField, normalTextureFromField } from './designer/shared/textures/imageNormalMap.js';
// Image ingest — the ONE pipeline a picked image goes through before it reaches R2: the format
// allowlist + size gate (validateImageFile), the photo compressor (aspect kept, long edge capped) and
// the decoration normalizer (alpha-cropped, centred in a square). Exported because spattoo-admin's
// element authoring runs the SAME functions: a baker's uploaded decoration and an admin-authored
// element must be produced by identical code, or the two drift (they had — the admin copy honoured no
// EXIF orientation and hung forever on a file it couldn't decode).
export { ACCEPT_IMAGE, IMAGE_TYPES, MAX_IMAGE_BYTES, validateImageFile, imageExt, decodeImage, encodeWebp, compressImage, normalizeArtwork, extractLogoPalette } from './shared/image.js';
export { useUploadLimits } from './shared/useUploadLimits.js';
// What a template must say about itself before it can be saved. Exported for the same reason the
// image pipeline above is: spattoo-admin's template authoring must apply the IDENTICAL rule to the
// baker's save modal, and two copies of "which categories are required" is the coupling that was
// removed from TMPL_CATS, CAT_LABEL and admin's CATEGORIES — it must not come back through a
// validation check. One named list, two callers.
export { REQUIRED_TAG_CATEGORIES, missingRequiredCategories, requiredTagMessage, ageRangeProblem } from './shared/tagRequirements.js';
// Vendor-neutral error telemetry. Host apps inject a Sentry-backed transport via
// configureTelemetry(); until then it logs to the console. See src/telemetry/.
export { reportError, reportMessage, setContext, configureTelemetry } from './telemetry/index.js';
export { ErrorBoundary } from './telemetry/ErrorBoundary.jsx';
export { installGlobalHandlers } from './telemetry/globalHandlers.js';

// ── UI typography ────────────────────────────────────────────────────────────
// SEC-WEB-7: this library NAMES its font but no longer LOADS it — it used to
// @import Google Fonts from 17 places, putting a third-party origin in every
// host app's CSP. Host apps must self-host the families in REQUIRED_FONT_FAMILIES
// (spattoo-web: next/font/google; spattoo-admin: a self-hosted @font-face).
// `warnIfFontsMissing()` runs on import and warns exactly once if they didn't —
// a missing webfont silently falls back to a system font, which is how the
// storefront FONT_THEMES fonts went unloaded for months without anyone noticing.
export { UI_FONT, REQUIRED_FONT_FAMILIES, warnIfFontsMissing } from './shared/fonts.js';
import { warnIfFontsMissing as _warnIfFontsMissing } from './shared/fonts.js';
_warnIfFontsMissing();

/* ── Piping ring placement, for admin's calibrator ──────────────────────────────────────────────
 *
 * ⚠️ EXPORTED BECAUSE THE CALIBRATOR HAD REIMPLEMENTED ALL OF IT. `PipingCalibrator.jsx` carried its
 * own `buildShellGeo`, `buildSwagRing`, `buildFestoons`, `wallPerimeter` and `buildWrapBand` — five
 * functions this package already owned — and the two drifted, which is exactly what CLAUDE.md warns
 * about in its own words: "THE STUDIO IMPORTS THE GEOMETRY, IT DOES NOT CARRY A COPY OF IT … or the
 * tuned version and the rendered version drift."
 *
 * It drifted in a way that cost a day: the calibrator's `buildShellGeo` took no RADIUS, so it never
 * applied `capShellScale` — the cap the cake uses to stop a shell outgrowing its tier. A rosette
 * could therefore sit perfectly in the tool and render differently on the cake, and the tool whose
 * only job is to produce trustworthy numbers was the one thing not showing what a customer sees.
 * Sandeep: *"i loaded this in piping calibrator. and it landed perfectly fine."*
 */
export { buildShellGeo, capShellScale, wallPerimeter, extractGeo } from './designer/canvas/shellGeo.js';
export { buildSwagRing, perimeterRing, ringPositions, perimeterSinglePos, angleAtPoint } from './designer/canvas/ringPositions.js';
export { shellMatrix } from './designer/canvas/shellMatrix.js';
export { buildFestoons, buildWrapBand, perimeterBreaks } from './designer/geometry/festoon.js';
