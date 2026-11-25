import type { ConnectorConfig } from "./config";
import type { FetchFn } from "./net";
import { googleAdsConnector } from "./providers/google-ads";
import { instagramConnector } from "./providers/instagram";
import { metaAdsConnector } from "./providers/meta-ads";
import type { Connector } from "./providers/types";
import { youtubeConnector } from "./providers/youtube";
import type { ConnectorId } from "./types";

/**
 * Provider registry: the connector for an id, built from the config (credentials) and a fetch (tests pass a fake
 * one). Null when the provider is not configured; callers check canConnect / enabled first.
 */
export function connectorFor(id: ConnectorId, cfg: ConnectorConfig, fetchFn: FetchFn = (u, i) => fetch(u, i)): Connector | null {
  if (!cfg.providers[id].enabled) return null;
  const deps = { fetch: fetchFn };
  const { meta, google } = cfg;
  switch (id) {
    case "instagram":
      return instagramConnector({ appId: meta.appId!, appSecret: meta.appSecret!, configId: meta.igConfigId!, graphVersion: meta.graphVersion }, deps);
    case "meta_ads":
      return metaAdsConnector({ appId: meta.appId!, appSecret: meta.appSecret!, configId: meta.adsConfigId!, graphVersion: meta.graphVersion }, deps);
    case "youtube":
      return youtubeConnector({ clientId: google.clientId!, clientSecret: google.clientSecret! }, deps);
    case "google_ads":
      return googleAdsConnector(
        { clientId: google.clientId!, clientSecret: google.clientSecret! },
        { apiVersion: google.adsApiVersion, developerToken: google.adsDeveloperToken },
        deps,
      );
  }
}
