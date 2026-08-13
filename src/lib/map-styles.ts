/**
 * The optional furniture on the browse map: the things a seeker may want out
 * of the way while reading a street, or switched on while judging what is
 * around a room.
 *
 * These are base-map *styles*, not data. Toggling one restyles tiles Google is
 * already serving and costs nothing, which is the whole difference between
 * this and the Places nearby-search layer that used to sit in the same menu -
 * that one put a paid API request behind a browsing toggle and was removed for
 * it. Do not reintroduce anything here that has to fetch.
 *
 * Google's styling reference has no restaurant-only feature type: every
 * commercial pin, from a hawker stall to IMM, is `poi.business`. So the toggle
 * is named for what it actually hides rather than for restaurants alone.
 *
 * This module imports nothing, so the style array and the labels beside it
 * stay one definition shared by the menu and the map.
 */

export type MapLayer = "business" | "transit" | "neighbourhoods";

/** One rule in a Maps style array. Only ever used here to hide a feature. */
export type MapStyleRule = {
  featureType: string;
  stylers: { visibility: "off" }[];
};

/**
 * Order is fixed: it sets the order of the menu rows and, through
 * `layerStyleId`, the identity of each registered styled map type.
 */
export const MAP_LAYERS: {
  id: MapLayer;
  label: string;
  /** Google's feature type. American spelling is theirs, not our copy. */
  featureType: string;
}[] = [
  { id: "business", label: "Restaurants & shops", featureType: "poi.business" },
  { id: "transit", label: "Transit", featureType: "transit" },
  {
    id: "neighbourhoods",
    label: "Neighbourhoods",
    featureType: "administrative.neighborhood",
  },
];

export type MapLayerState = Record<MapLayer, boolean>;

export const ALL_LAYERS_VISIBLE: MapLayerState = {
  business: true,
  transit: true,
  neighbourhoods: true,
};

/**
 * Stable id for one combination of hidden layers, so a styled map type is
 * registered once per combination instead of once per toggle.
 *
 * Empty string means nothing is hidden, which the map reads as "use the plain
 * roadmap" - see the comment on the effect in `results-map.tsx`.
 */
export function layerStyleId(state: MapLayerState): string {
  const hidden = MAP_LAYERS.filter((layer) => !state[layer.id]);
  return hidden.length ? `hide:${hidden.map((l) => l.id).join("+")}` : "";
}

/** The style array for whatever is switched off. Empty when nothing is. */
export function hiddenLayerStyles(state: MapLayerState): MapStyleRule[] {
  return MAP_LAYERS.filter((layer) => !state[layer.id]).map((layer) => ({
    featureType: layer.featureType,
    stylers: [{ visibility: "off" }],
  }));
}
