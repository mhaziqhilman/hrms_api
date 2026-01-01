# HRMS Backend API

Malaysian HR Management System (HRMS) Backend API built with Node.js, Express, and Sequelize.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Employee Management**: Complete employee lifecycle management
- **Payroll Processing**: Malaysian statutory calculations (EPF, SOCSO, EIS, PCB)
- **Leave Management**: Leave application and approval workflows
- **Attendance Tracking**: Clock in/out with location tracking
- **Claims Processing**: Expense claims submission and approval
- **Communication**: Memos and policy management
- **E-Invoice**: LHDN MyInvois integration

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: express-validator
- **Logging**: Winston
- **Email**: Nodemailer
- **File Upload**: Multer
- **PDF Generation**: PDFKit

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- MySQL (v8 or higher)

## Installation

1. **Clone the repository**
   ```bash
   cd HRMS-API_v1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` file with your configuration:
   - Database credentials
   - JWT secret
   - Email service credentials
   - LHDN API credentials (for e-Invoice)

4. **Create MySQL database**
   ```sql
   CREATE DATABASE hrms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Run database migrations** (if DB_SYNC=true in .env)
   ```bash
   npm run dev
   ```
   The application will auto-sync database models on first run in development mode.

## Running the Application

### Development Mode
```bash
npm run dev
```
Server will run on `http://localhost:3000` with auto-reload on file changes.

### Production Mode
```bash
npm start
```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token",
  "newPassword": "NewPassword123"
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### User Roles

- **super_admin**: Full system access
- **admin**: Employee management, payroll, approvals, reports
- **manager**: Team leave/claims approval, team reports
- **staff**: Self-service features only

## Project Structure

```
HRMS-API_v1/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.js
│   │   ├── jwt.js
│   │   ├── email.js
│   │   └── lhdn.js
│   │
│   ├── models/           # Sequelize models
│   │   ├── User.js
│   │   ├── Employee.js
│   │   ├── YTDStatutory.js
│   │   ├── Leave.js
│   │   ├── Attendance.js
│   │   ├── Claim.js
│   │   └── index.js
│   │
│   ├── controllers/      # Business logic
│   │   └── authController.js
│   │
│   ├── routes/           # API routes
│   │   └── auth.routes.js
│   │
│   ├── middleware/       # Express middleware
│   │   ├── auth.middleware.js
│   │   ├── rbac.middleware.js
│   │   ├── validation.middleware.js
│   │   └── error.middleware.js
│   │
│   ├── services/         # Business services
│   │   ├── emailService.js
│   │   └── statutoryService.js
│   │
│   ├── utils/            # Utility functions
│   │   ├── logger.js
│   │   ├── validators.js
│   │   └── helpers.js
│   │
│   └── app.js            # Express app entry point
│
├── tests/                # Test files
│   ├── unit/
│   └── integration/
│
├── logs/                 # Application logs
├── uploads/              # File uploads
├── .env.example          # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `DB_HOST` | MySQL host | localhost |
| `DB_NAME` | Database name | hrms_db |
| `JWT_SECRET` | JWT signing secret | - |
| `EMAIL_USER` | Email service username | - |
| `LHDN_CLIENT_ID` | LHDN API client ID | - |

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Account Lockout**: 5 failed login attempts = 30 min lockout
- **Input Validation**: express-validator for all inputs

## Malaysian Statutory Calculations

### EPF (Employees Provident Fund)
- Employee: 11% of salary
- Employer: 13% (salary ≤ RM5,000) or 12% (salary > RM5,000)
- Maximum cap: RM30,000

### SOCSO (Social Security Organization)
- Based on 34-tier contribution table
- Maximum cap: RM5,000

### EIS (Employment Insurance System)
- Employee: 0.2%
- Employer: 0.2%
- Maximum cap: RM5,000

### PCB (Monthly Tax Deduction)
- Based on LHDN PCB tables
- Considers tax relief categories

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm test -- --coverage
```

## Logging

Logs are stored in the `logs/` directory:
- `error.log`: Error-level logs
- `combined.log`: All logs

## Health Check

```http
GET /health
```

Returns API status and environment information.

## Development Guidelines

1. **Code Style**: Follow JavaScript Standard Style
2. **Commits**: Use conventional commit messages
3. **Branches**:
   - `main`: Production-ready code
   - `develop`: Development branch
   - `feature/*`: Feature branches
4. **Pull Requests**: Required for all changes

## Troubleshooting

### Database Connection Error
- Verify MySQL is running
- Check database credentials in `.env`
- Ensure database exists

### Email Not Sending
- Verify email credentials in `.env`
- Check if less secure app access is enabled (Gmail)
- Review logs for detailed error messages

### JWT Token Invalid
- Ensure JWT_SECRET is set in `.env`
- Check token expiration time
- Verify Authorization header format: `Bearer <token>`

## License

ISC

## Support

For issues and questions, please contact:
- **Email**: support@averroesds.com
- **Company**: Averroes Data Science

## Roadmap

- [ ] Employee CRUD operations
- [ ] Payroll processing module
- [ ] Leave management system
- [ ] Attendance tracking
- [ ] Claims processing
- [ ] Communication module
- [ ] E-Invoice integration
- [ ] Reports and analytics
- [ ] Mobile app support
- [ ] Multi-language support

---

**Version**: 1.0.0
**Last Updated**: November 29, 2025
**Developed by**: Averroes Data Science
