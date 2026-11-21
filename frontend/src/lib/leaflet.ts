/** Load Leaflet from the CDN once and share it between map components. */
let leafletPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Leaflet needs a browser"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("dispatch-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "dispatch-leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    let script = document.getElementById("dispatch-leaflet-js") as HTMLScriptElement | null;
    const done = () => ((window as any).L ? resolve((window as any).L) : reject(new Error("Leaflet failed to load")));
    if (!script) {
      script = document.createElement("script");
      script.id = "dispatch-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.body.appendChild(script);
    }
    script.addEventListener("load", done);
    script.addEventListener("error", () => {
      leafletPromise = null;
      reject(new Error("Leaflet failed to load"));
    });
  });
  return leafletPromise;
}
