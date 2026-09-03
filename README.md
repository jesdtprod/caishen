# Caishen Enterprises

Simple GitHub Pages frontend with Google Apps Script and Google Sheets backend.

## Modules

- Product Registration
- Stock-In
- Sales
- Inventory
- Admin user creation
- Admin and Staff/Encoder dashboard roles

## Frontend Files for GitHub Pages

- `Index.html`
- `styles.css`
- `app.js`
- `assets/ce-logo.png`

## Google Apps Script Setup

1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Add this backend file:
   - `Code.gs`
4. Deploy as Web App.
5. Use these deployment settings:
   - Execute as: Me
   - Who has access: Anyone with the link
6. Copy the Web App URL.
7. Paste it in `app.js`:

```js
const APPS_SCRIPT_URL = 'YOUR_WEB_APP_URL';
```
8. Run `setupDatabase()` once, or open the API URL to auto-create sheets.

Default admin login:

```text
Username: admin
Password: admin123
```

Change the default password after first login.
