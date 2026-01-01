@echo off
echo ========================================
echo HRMS Database Setup Script
echo ========================================
echo.

REM Set your MySQL credentials here
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=root
set DB_PASS=
set DB_NAME=hrms_db

echo Creating database: %DB_NAME%
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% -e "CREATE DATABASE IF NOT EXISTS %DB_NAME% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo.
echo Running migrations...
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < migrations\001_create_all_tables.sql

echo.
echo ========================================
echo Database setup complete!
echo ========================================
echo Database: %DB_NAME%
echo Host: %DB_HOST%:%DB_PORT%
echo.
echo Next steps:
echo 1. Update your .env file with database credentials
echo 2. Run: npm install
echo 3. Run: npm start
echo.
pause
