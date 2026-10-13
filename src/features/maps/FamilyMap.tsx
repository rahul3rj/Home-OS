/**
 * Family map: embedded MapLibre vector maps on keyless OpenFreeMap tiles.
 *
 * A WebView keeps this working inside Expo Go — native map modules need a
 * development build and API keys, which this app deliberately avoids. Markers
 * are pushed in from React Native with `injectJavaScript`, so the HTML shell
 * below is static and the data always comes from Supabase through the screen.
 *
 * Tiles follow the theme: Positron by day, Dark by night. Vector means
 * razor-sharp at every zoom, and no account or key anywhere.
 *
 * Check-in, SOS and reload live INSIDE the map window as circular icon
 * buttons (refresh top-left, the pair bottom-right) — native controls over
 * the WebView, so they stay tappable and accessible.
 *
 * The page handshakes back with `map-ready` once the style loads. Until then
 * a loading veil covers the box; if the CDN, WebGL or tiles fail, an error
 * with a retry takes its place — a silent blank box is never the outcome.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { Button, Icon, LoadingState, tapFeedback, Text } from '@/components/ui';
import type { IconName } from '@/components/ui/Feedback';
import { HIT_SIZE } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type MapPin = {
  id: string;
  kind: 'place' | 'member';
  label: string;
  lat: number;
  lng: number;
  /** Photo URL for the teardrop avatar pin. Null falls back to initials. */
  avatarUrl?: string | null;
  /** Precomputed initials (RN side owns tint logic). */
  initials?: string;
  /** Face fill behind initials. Defaults to brand lime. */
  color?: string | null;
  /** SOS sender gets a red ring + pulse so the emergency reads instantly. */
  sos?: boolean;
  /** Own pin gets the lime ring. */
  isMe?: boolean;
};

export type MapFocus = {
  lat: number;
  lng: number;
  /** Changes every time so re-tapping the same row still flies there. */
  key: string;
};

/**
 * How long the engine/style load gets before the box admits defeat. Vector
 * needs the ~1MB library plus style, fonts and first tiles — generous on
 * slow data.
 */
const READY_TIMEOUT_MS = 30000;
/** When loading drags past this, say so instead of a static spinner. */
const SLOW_HINT_MS = 12000;

function buildHtml(dark: boolean): string {
  // OpenFreeMap vector tiles: keyless, limitless, no account. Positron by
  // day, Dark (a dark-matter fork, near-black) by night — both muted, so the
  // pins stay the focus. Vector means razor-sharp at every zoom: no more
  // blurry deep pinch. (CARTO raster needs an API key since Sep 2026.)
  const styleUrl = dark
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron';

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>' +
    // Two CDNs for the engine and the stylesheet each: a failed <script src>
    // does not halt parsing, so the second source still runs. Same pinned
    // v5 both times (v6 dropped the global build) — whichever arrives first
    // wins, no conflict.
    '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css"/>' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css"/>' +
    '<style>html,body,#map{height:100%;margin:0;padding:0}' +
    '.avatar-pin{position:relative;width:56px;height:68px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}' +
    '.avatar-face{position:relative;z-index:2;width:54px;height:54px;border-radius:50%;color:#fff;' +
    'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;' +
    'border:3px solid #fff;overflow:hidden}' +
    '.avatar-face img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.avatar-tail{position:absolute;z-index:1;left:50%;bottom:5px;width:15px;height:15px;' +
    'transform:translateX(-50%) rotate(45deg);border-radius:3px}' +
    '.sos-pulse{position:absolute;z-index:1;left:50%;top:27px;width:54px;height:54px;border-radius:50%;' +
    'transform:translate(-50%,-50%);border:3px solid #D03238;opacity:0;pointer-events:none}' +
    '.avatar-pin.sos .sos-pulse{animation:sosPing 1.6s ease-out infinite}' +
    '@keyframes sosPing{0%{transform:translate(-50%,-50%) scale(.7);opacity:.9}' +
    '100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}' +
    '.spot-pin{position:relative;width:36px;height:46px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}' +
    '.spot-face{position:relative;z-index:2;width:34px;height:34px;border-radius:50%;background:#0E0F0C;' +
    'display:flex;align-items:center;justify-content:center;border:3px solid #fff}' +
    '.spot-dot{width:10px;height:10px;border-radius:50%;background:#9FE870}' +
    '.spot-tail{position:absolute;z-index:1;left:50%;bottom:4px;width:12px;height:12px;background:#0E0F0C;' +
    'transform:translateX(-50%) rotate(45deg);border-radius:2px}' +
    // Name popups follow the theme so they never flash white on dark maps.
    (dark
      ? '.maplibregl-popup-content{background:#1B1D14!important;color:#F4F6F1!important;font-family:sans-serif}' +
        '.maplibregl-popup-tip{border-top-color:#1B1D14!important}'
      : '') +
    '</style>' +
    '</head><body><div id="map"></div>' +
    '<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>' +
    '<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>' +
    '<script>' +
    // Both CDNs down, or a device without WebGL: report the true cause
    // instead of timing out blank. The whole map lives inside the else.
    'if(!window.maplibregl){window.ReactNativeWebView.postMessage("map-error:Could not load the map engine.");}' +
    // NOTE: maplibregl.supported() was removed in v5 (verified against the
    // bundle) — calling it threw on every device and killed both modes.
    // Probe WebGL2 directly instead.
    'else if(!("WebGL2RenderingContext" in window)){window.ReactNativeWebView.postMessage("map-error:This device cannot draw vector maps.");}' +
    'else{window.onerror=function(msg){window.ReactNativeWebView.postMessage("map-error:"+msg);};' +
    'var map = new maplibregl.Map({container:"map",style:"' +
    styleUrl +
    '",center:[78.5,22.5],zoom:5,attributionControl:false});' +
    // Compact credit (an info button) — the licence stays, the watermark goes.
    'map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");' +
    'var markers=[];' +
    'function initialsOf(name){var p=String(name||"").trim().split(/\\s+/).filter(Boolean);' +
    'if(p.length===0)return"?";if(p.length===1)return p[0].slice(0,2).toUpperCase();' +
    'return (p[0][0]+p[p.length-1][0]).toUpperCase();}' +
    'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")' +
    '.replace(/>/g,"&gt;").replace(/\\u0022/g,"&quot;");}' +
    'function ringOf(pin){return pin.sos?"#D03238":(pin.isMe?"#9FE870":"#FFFFFF");}' +
    'function memberHtml(pin){var ring=ringOf(pin);var bg=pin.color||"#1B1D14";' +
    "var face=pin.avatarUrl?'<img src=\"'+esc(pin.avatarUrl)+'\"/>':esc(pin.initials||initialsOf(pin.label));" +
    "var pulse=pin.sos?'<div class=\"sos-pulse\"></div>':'';" +
    "return '<div class=\"avatar-pin'+(pin.sos?' sos':'')+'\">'+pulse+" +
    "'<div class=\"avatar-face\" style=\"background:'+bg+';border-color:'+ring+'\">'+face+'</div>' +" +
    '\'<div class="avatar-tail" style="background:\'+ring+\'"></div></div>\';}' +
    'function placeHtml(){return \'<div class="spot-pin"><div class="spot-face\">' +
    '<div class="spot-dot"></div></div><div class="spot-tail"></div></div>\';}' +
    'window.__setMarkers = function(pins){window.__lastPins=pins;markers.forEach(function(m){m.remove();});markers=[];' +
    'var bounds=new maplibregl.LngLatBounds();' +
    'pins.forEach(function(pin){' +
    'var el=document.createElement("div");' +
    'el.innerHTML=(pin.kind==="member")?memberHtml(pin):placeHtml();' +
    'var mk=new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat([pin.lng,pin.lat]);' +
    'mk.setPopup(new maplibregl.Popup({offset:30,closeButton:false}).setText(pin.label));' +
    'mk.addTo(map);markers.push(mk);' +
    'bounds.extend([pin.lng,pin.lat]);});' +
    'if(!bounds.isEmpty()){map.fitBounds(bounds,{padding:40});}};' +
    'window.__refreshMap = function(){map.resize();window.__setMarkers(window.__lastPins||[]);map.triggerRepaint();};' +
    'window.__focus = function(lat,lng){map.flyTo({center:[lng,lat],zoom:14});};' +
    'map.on("load",function(){window.ReactNativeWebView.postMessage("map-ready");});' +
    '}' +
    '</script></body></html>'
  );
}

export function FamilyMap({
  pins,
  focus,
  height = 340,
  onInteractionStart,
  onInteractionEnd,
  sharing,
  sharePending,
  sosPending,
  onSharePress,
  onSosPress,
}: {
  pins: MapPin[];
  focus: MapFocus | null;
  height?: number;
  /** Parent page locks its ScrollView while fingers are on the map. */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  /** True once the live row is published — the check-in button flips to stop. */
  sharing: boolean;
  sharePending: boolean;
  sosPending: boolean;
  onSharePress: () => void;
  onSosPress: () => void;
}) {
  const theme = useTheme();
  const dark = theme.name === 'dark';
  const ref = useRef<WebView>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // The shell only rebuilds when the theme flips; data always flows through
  // the bridge below, never through a rebuilt page.
  const html = useMemo(() => buildHtml(dark), [dark]);
  const payload = useMemo(() => JSON.stringify(pins), [pins]);

  // A fresh shell means a fresh load — back behind the veil until it reports.
  // Resetting state from an effect is the documented exception here: the
  // WebView page is an external system that was just torn down and rebuilt,
  // so "ready" from the old page is stale (same pattern as household load).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fresh WebView shell, stale ready */
    setStatus('loading');
    setDetail(null);
    setSlow(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [html]);

  function pushPins() {
    // Guarded: onLoadEnd can fire before the page defines the receiver.
    ref.current?.injectJavaScript(
      'if(window.__setMarkers){window.__setMarkers(' + payload + ');}true;',
    );
  }

  function markReady() {
    // The [payload, status, html] effect below pushes the pins once the page
    // reports ready — nothing else to do here.
    setStatus('ready');
  }

  // No handshake in time means the CDN or tiles never arrived (offline, a
  // blocked host) — say so instead of sitting blank forever.
  useEffect(() => {
    if (status !== 'loading') return;
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS);
    const timer = setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'error' : current));
    }, READY_TIMEOUT_MS);
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(timer);
    };
  }, [status, reloadKey, html]);

  useEffect(() => {
    if (status === 'ready') pushPins();
    // Pushes the latest pins once the page is up; `payload` carries the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, status, html]);

  useEffect(() => {
    if (focus && status === 'ready') {
      ref.current?.injectJavaScript('window.__focus(' + focus.lat + ',' + focus.lng + ');true;');
    }
  }, [focus, status]);

  function retry() {
    setDetail(null);
    setSlow(false);
    setStatus('loading');
    setReloadKey((key) => key + 1);
  }

  /**
   * Refreshes the MAP, not the page: re-measures the view, re-renders the
   * pins and re-fits the camera — no data refetch, no page spinner. On a
   * failed engine it retries the load instead.
   */
  function refreshMap() {
    tapFeedback();
    if (status === 'error') {
      retry();
      return;
    }
    if (status !== 'ready') return;
    ref.current?.injectJavaScript('if(window.__refreshMap){window.__refreshMap();}true;');
  }

  function handleMessage(data: string) {
    if (data === 'map-ready') {
      markReady();
    } else if (data.startsWith('map-error:')) {
      setDetail(data.slice('map-error:'.length).trim() || null);
      setStatus('error');
    }
  }

  return (
    <View
      style={{
        height,
        borderRadius: theme.radius.xl,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceMuted,
      }}
      // A WebView pan inside a ScrollView page scrolls the page instead of
      // the map. Holding the parent locked while fingers are down gives the
      // gesture to the map; release hands it back.
      onTouchStart={onInteractionStart}
      onTouchEnd={onInteractionEnd}
      onTouchCancel={onInteractionEnd}
    >
      <WebView
        key={`${dark ? 'dark' : 'light'}-${reloadKey}`}
        ref={ref}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        nestedScrollEnabled
        onMessage={(event) => handleMessage(event.nativeEvent.data)}
        onError={() => setStatus('error')}
        onHttpError={() => setStatus('error')}
        onLoadEnd={pushPins}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
      {status !== 'ready' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceMuted,
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          {status === 'loading' ? (
            <LoadingState label={slow ? 'Still loading — slow connection…' : 'Loading the map…'} />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text variant="title" style={{ textAlign: 'center' }}>
                The map could not load
              </Text>
              <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
                It needs the internet for its tiles. Check your connection and try again.
              </Text>
              {detail ? (
                <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
                  {detail}
                </Text>
              ) : null}
              <Button label="Try again" variant="tertiary" onPress={retry} />
            </View>
          )}
        </View>
      ) : null}

      {/* In-map controls: refresh where the zoom buttons were, check-in and
          SOS stacked bottom-right. Icon-only circles over the map. */}
      <MapCornerButton
        icon="RefreshCw"
        label="Refresh map"
        hint="Re-renders the map and re-fits every pin"
        fill="surface"
        style={styles.refreshSpot}
        onPress={refreshMap}
      />
      <View style={styles.cornerStack}>
        <MapCornerButton
          icon="Siren"
          label="Send SOS"
          hint="Alerts the home and calls the head"
          fill="danger"
          pending={sosPending}
          onPress={onSosPress}
        />
        {sharing ? (
          <MapCornerButton
            icon="X"
            label="Stop sharing"
            hint="Stops sharing your live location"
            fill="surface"
            pending={sharePending}
            onPress={onSharePress}
          />
        ) : (
          <MapCornerButton
            icon="LocateFixed"
            label="Check in"
            hint="Shares your live location with the home"
            fill="lime"
            pending={sharePending}
            onPress={onSharePress}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Circular icon button floating over the map. Same 48px target and
 * opacity-only press as everything else in the kit.
 */
function MapCornerButton({
  icon,
  label,
  hint,
  fill,
  pending,
  onPress,
  style,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  fill: 'lime' | 'surface' | 'danger';
  pending?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const background =
    fill === 'lime'
      ? theme.colors.primary
      : fill === 'danger'
        ? theme.colors.negative
        : theme.colors.surface;
  const ink =
    fill === 'lime'
      ? theme.colors.onPrimary
      : fill === 'danger'
        ? theme.colors.surface
        : theme.colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy: Boolean(pending) }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: HIT_SIZE,
          height: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: background,
          borderWidth: fill === 'surface' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.hairline,
          opacity: pressed ? 0.7 : 1,
          ...theme.shadow.raised,
        },
        style,
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <Icon
          name={icon}
          size={22}
          tone={fill === 'lime' ? 'onPrimary' : fill === 'danger' ? 'inverse' : 'muted'}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  refreshSpot: { position: 'absolute', top: 12, left: 12, zIndex: 1 },
  cornerStack: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    gap: 12,
    zIndex: 1,
  },
});
