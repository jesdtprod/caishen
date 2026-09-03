# CE Inventory and Sales

Simple Google Sheets and Google Apps Script inventory system.

## Modules

- Product Registration
- Stock-In
- Sales
- Inventory
- Admin user creation
- Admin and Staff/Encoder dashboard roles

## Google Apps Script Setup

1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Add these files:
   - `Code.gs`
   - `Index.html`
   - `Styles.html`
   - `Client.html`
4. Deploy as Web App.
5. Run `setupDatabase()` once, or open the Web App to auto-create sheets.
6. Upload `assets/ce-logo.png` to a public image location, then run:

```js
setLogoUrl('YOUR_PUBLIC_LOGO_URL')
```

Default admin login:

```text
Username: admin
Password: admin123
```

Change the default password after first login.
