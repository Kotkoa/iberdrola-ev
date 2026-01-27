# MCP Servers Configuration

## mui-mcp

**Always use the MUI MCP server** when working with Material UI components, theming, styling, or MUI-specific APIs and patterns.

## context7

**Always use the Context7 MCP server** to retrieve up-to-date documentation, examples, and best practices for third-party libraries and frameworks.

## chrome-devtools

**Always use the Chrome DevTools MCP server** when debugging frontend issues, analyzing performance, inspecting DOM, or working with browser runtime behavior.

## supabase

**Always use the Supabase MCP server** when working with Supabase database operations, Edge Functions, branches, or any Supabase-related tasks.

## playwright

**Always use the Playwright MCP server** for E2E testing automation. The server provides browser automation capabilities:

### Key Tools

| Tool                       | Purpose                             |
| -------------------------- | ----------------------------------- |
| `browser_navigate`         | Navigate to URL                     |
| `browser_screenshot`       | Take screenshot                     |
| `browser_click`            | Click element by text/selector      |
| `browser_type`             | Type text into input                |
| `browser_hover`            | Hover over element                  |
| `browser_select_option`    | Select dropdown option              |
| `browser_handle_dialog`    | Accept/dismiss dialogs              |
| `browser_tab_*`            | Tab management (new, select, close) |
| `browser_network_requests` | Get network request log             |
| `browser_console_messages` | Get console messages                |
| `browser_wait`             | Wait for condition                  |
| `browser_press_key`        | Press keyboard key                  |
| `browser_resize`           | Resize browser window               |

### Element Selection

Elements can be selected by:

- **Text content**: `"Find Stations"` - clicks button with this text
- **CSS selector**: `css=#search-button`
- **Test ID**: `data-testid=search-button`
- **Placeholder**: `placeholder=Enter email`
- **Role**: `role=button[name="Submit"]`

### Usage Notes

1. **Screenshots**: Use `browser_screenshot` to verify UI state
2. **Waiting**: Use `browser_wait` for dynamic content
3. **Network**: Monitor API calls with `browser_network_requests`
4. **Console**: Check for errors with `browser_console_messages`

### Example Workflow

```
1. browser_navigate → http://localhost:5173
2. browser_screenshot → verify initial state
3. browser_click → "Search" tab
4. browser_type → select radius
5. browser_click → "Find Stations"
6. browser_wait → wait for results
7. browser_screenshot → verify results
```
