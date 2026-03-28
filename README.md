# Krazy Shop Bot

  Discord bot for Krazy Shop — handles the purchase panel, stock tracking, and ticket system.

  ## Commands
  | Command | Description | Permission |
  |---|---|---|
  | `.ticketpanel2` | Posts the purchase panel with dropdown | Admin |
  | `.stock` | Shows current stock for all items | Everyone |
  | `.addstock [item] [amount]` | Add stock to an item | Admin |
  | `.removestock [item] [amount]` | Remove stock from an item | Admin |

  ## Setup
  1. `npm install`
  2. Set `BOT_TOKEN` environment variable to your bot token
  3. Place your banner image at `assets/ticketpanel2_banner.jpg`
  4. `npm start`

  On first launch the bot auto-uploads all product emojis to its Application Emoji slots so they render everywhere.
  