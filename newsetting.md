# System Settings Module

## New Files Created

### 1. UserSettings.js - Model
**Path:** `src/models/UserSettings.js`

Stores user preferences with sections for:
- **Appearance**: theme (light/dark/system), sidebar_collapsed, compact_mode
- **Display**: language, timezone, date_format, time_format
- **Notifications**: email_notifications, push_notifications, and specific toggles for leave approval, claim approval, payslip, memo, policy updates
- **Account**: two_factor_enabled, session_timeout_minutes

### 2. settingsController.js - Controller
**Path:** `src/controllers/settingsController.js`

Includes endpoints for:
- `getSettings` - Get all user settings
- `getAccountInfo` - Get account info (email, role, last login)
- `updateAppearanceSettings` - Update theme, sidebar, compact mode
- `updateDisplaySettings` - Update language, timezone, date/time format
- `updateNotificationSettings` - Update notification preferences
- `updateAccountSettings` - Update session timeout
- `changePassword` - Change user password (moved here from auth)
- `enableTwoFactor` / `disableTwoFactor` - 2FA management
- `resetToDefault` - Reset all settings to default

### 3. settings.routes.js - Routes
**Path:** `src/routes/settings.routes.js`

API endpoints available at `/api/settings`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all settings |
| GET | `/account` | Get account info |
| PUT | `/appearance` | Update appearance |
| PUT | `/display` | Update display |
| PUT | `/notifications` | Update notifications |
| PUT | `/account` | Update account settings |
| POST | `/change-password` | Change password |
| POST | `/two-factor/enable` | Enable 2FA |
| POST | `/two-factor/disable` | Disable 2FA |
| POST | `/reset` | Reset to default |

## Updated Files
- `src/models/index.js` - Added UserSettings import, association with User, and export
- `src/app.js` - Registered settings routes

## Notes
The change password endpoint at `/api/auth/change-password` still works, but you also have it available at `/api/settings/change-password` for your settings page. You can remove it from auth routes later if you prefer it only in settings.

## Database Table: user_settings

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | INTEGER | AUTO | Primary key |
| user_id | INTEGER | - | Foreign key to users table |
| theme | ENUM | 'light' | light, dark, system |
| sidebar_collapsed | BOOLEAN | false | Sidebar state |
| compact_mode | BOOLEAN | false | Compact UI mode |
| language | STRING(10) | 'en' | Language code |
| timezone | STRING(50) | 'Asia/Kuala_Lumpur' | Timezone |
| date_format | STRING(20) | 'DD/MM/YYYY' | Date format |
| time_format | ENUM | '12h' | 12h or 24h |
| email_notifications | BOOLEAN | true | Email notifications enabled |
| push_notifications | BOOLEAN | true | Push notifications enabled |
| notify_leave_approval | BOOLEAN | true | Leave approval notifications |
| notify_claim_approval | BOOLEAN | true | Claim approval notifications |
| notify_payslip_ready | BOOLEAN | true | Payslip ready notifications |
| notify_memo_received | BOOLEAN | true | Memo received notifications |
| notify_policy_update | BOOLEAN | true | Policy update notifications |
| two_factor_enabled | BOOLEAN | false | 2FA enabled |
| two_factor_secret | STRING(255) | null | 2FA secret key |
| session_timeout_minutes | INTEGER | 30 | Session timeout in minutes |
| created_at | DATETIME | - | Created timestamp |
| updated_at | DATETIME | - | Updated timestamp |
