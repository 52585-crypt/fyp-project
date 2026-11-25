import { ProviderPreviewCard, type IconName } from "../../design/components";
import type { ColorToken } from "../../design/tokens";
import { t, tp } from "../../i18n/translate";
import { CATEGORY_FOR_SERVICE, SERVICE_FOR_CATEGORY } from "../nearbyProviderMarkers";
import type { NearbyProvider, ProviderService, RequestCategory } from "../requests.types";
import { getServiceTitle } from "../serviceCatalog";
import { etaLabel, type ProviderEta } from "../useProviderPreview";

/** Card look per service, matching the provider's map marker colour. */
const LOOK: Record<ProviderService, { icon: IconName; accent: ColorToken; onAccent: ColorToken }> = {
  mechanic: { icon: "construct", accent: "serviceMechanic", onAccent: "onServiceMechanic" },
  towing: { icon: "car", accent: "serviceTowing", onAccent: "onServiceTowing" },
  fuel_delivery: { icon: "water", accent: "serviceFuel", onAccent: "onServiceFuel" }
};

type Props = {
  provider: NearbyProvider;
  /** The category the list was loaded for; used when a row carries no service. */
  fallbackCategory: RequestCategory;
  eta?: ProviderEta | null;
  /** Starts the normal booking flow for this provider's service (dispatch still picks the provider). */
  onRequest?: (category: RequestCategory) => void;
  onClose?: () => void;
};

const BAND_KEY = { "under 2 km": "bandUnder2", "2–5 km": "band2to5", "5–10 km": "band5to10", "10+ km": "band10plus" } as const;

/** The server's distance band in the current language (unknown bands are shown as sent). */
export function distanceBandLabel(band: string) {
  const key = BAND_KEY[band as keyof typeof BAND_KEY];
  return key ? t("nearby", key) : band;
}

/** A nearby provider (approximate position only) as a preview card: rating or "New provider", jobs, distance band, ETA. */
export function NearbyProviderCard({ provider: p, fallbackCategory, eta, onRequest, onClose }: Props) {
  const category = p.serviceCategory ? CATEGORY_FOR_SERVICE[p.serviceCategory] : fallbackCategory;
  const look = LOOK[SERVICE_FOR_CATEGORY[category]];
  const title = getServiceTitle(category);
  return (
    <ProviderPreviewCard name={p.name} serviceLabel={title} {...look} rating={p.ratingAvg} ratingCount={p.ratingCount}
      completedJobs={p.completedJobs} distanceLabel={distanceBandLabel(p.distanceBand)} etaLabel={etaLabel(eta?.minutes ?? null)}
      etaLoading={eta?.loading} actionLabel={onRequest ? tp("nearby", "request", { service: title }) : undefined}
      onAction={onRequest ? () => onRequest(category) : undefined} onClose={onClose} testID={`nearby-provider-${p.id}`} />
  );
}
