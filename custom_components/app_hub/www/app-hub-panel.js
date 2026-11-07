/*
 * App Hub panel: the sidebar entry.
 *
 * Home Assistant hands a custom panel the `hass` object and the `panel` descriptor, and gives
 * it the whole content area with no dashboard toolbar. The panel is therefore only a host: it
 * builds the same <app-hub-card> a dashboard would, from the config the integration attached to
 * the panel, and forwards `hass` to it.
 *
 * The card element comes from app-hub-card.js, which the integration loads on every frontend
 * load, so the panel waits for its definition instead of importing it a second time.
 */
const CARD = "app-hub-card";

class AppHubPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        /* A custom panel is given the whole content area with no toolbar above it, but the
           parent has no definite height, so a percentage height collapses to the card's own
           minimum. The viewport is the panel. */
        :host{display:block;height:100vh;background:var(--primary-background-color,#fafbfe)}
        .wrap{height:100%}
        /* The panel owns the viewport, so the card fills it instead of sitting in a column. */
        .wrap ha-card,.wrap > *{--app-hub-max-width:none}
        .late{padding:24px;color:var(--secondary-text-color,#6b7482);font-family:Roboto,system-ui,sans-serif}
      </style>
      <div class="wrap"><div class="late">...</div></div>`;
    this._wrap = this.shadowRoot.querySelector(".wrap");
  }

  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
  }
  get hass() { return this._hass; }

  set narrow(narrow) {
    this._narrow = narrow;
    this.toggleAttribute("narrow", !!narrow);
  }
  get narrow() { return this._narrow; }

  // panel_custom hands the integration's config through here.
  set panel(panel) {
    this._panel = panel;
    this._build();
  }
  get panel() { return this._panel; }

  connectedCallback() { this._build(); }

  async _build() {
    if (this._building || !this.isConnected) return;
    this._building = true;
    try {
      await customElements.whenDefined(CARD);
      const cfg = (this._panel && this._panel.config) || {};
      const card = document.createElement(CARD);
      card.setConfig({
        // The panel has no toolbar of its own and the sidebar stays where it is, so none of
        // the card's chrome control is needed here: only its own back control.
        ...(cfg.apps ? { apps: cfg.apps } : {}),
        theme: cfg.theme || "ha",
        dry_run: !!cfg.dry_run,
        back_button: "auto",
        height: "100vh",
      });
      if (this._hass) card.hass = this._hass;
      this._wrap.replaceChildren(card);
      this._card = card;
    } catch (e) {
      this._wrap.innerHTML = `<div class="late">App Hub: ${String(e && e.message ? e.message : e)}</div>`;
    } finally {
      this._building = false;
    }
  }
}

if (!customElements.get("app-hub-panel")) customElements.define("app-hub-panel", AppHubPanel);
