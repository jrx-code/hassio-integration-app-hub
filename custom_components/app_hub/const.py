"""Constants for the App Hub integration."""

DOMAIN = "app_hub"

# The integration serves its own frontend bundle; nothing has to be copied to /config/www.
STATIC_URL = f"/{DOMAIN}_static"
CARD_FILE = "app-hub-card.js"
PANEL_FILE = "app-hub-panel.js"

# Sidebar panel: the apps open full screen, which is what the producer apps look like.
PANEL_URL = "app-hub"
PANEL_ELEMENT = "app-hub-panel"

CONF_APPS = "apps"
CONF_THEME = "theme"
CONF_DRY_RUN = "dry_run"
CONF_SIDEBAR = "sidebar"
CONF_SIDEBAR_TITLE = "sidebar_title"
CONF_SIDEBAR_ICON = "sidebar_icon"

DEFAULT_SIDEBAR_TITLE = "Aplikacje"
DEFAULT_SIDEBAR_ICON = "mdi:apps"
