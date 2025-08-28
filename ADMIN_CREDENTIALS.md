# Admin Login Credentials

## 🎯 Quick Reference Card

### Production Admin Logins
**API URL**: `https://api-hetasinglar.onrender.com`

| Admin ID    | Password      | Role        | Name                | Access Level |
|-------------|---------------|-------------|---------------------|--------------|
| `admin`     | `admin123`    | super_admin | Super Admin         | Full Access  |
| `superadmin`| `Super@Admin123` | super_admin | Super Administrator | Full Access  |
| `admin1`    | `Admin@123`   | admin       | Admin Manager       | Standard     |
| `admin2`    | `Admin@456`   | admin       | Content Admin       | Standard     |

## 🔐 How to Login

1. **Frontend Admin Panel**: Go to your admin login page
2. **Enter Credentials**: Use any Admin ID + Password combination above
3. **API Testing**: Use these credentials for API testing

## 🛠️ API Login Example

```javascript
// Login request
POST https://api-hetasinglar.onrender.com/api/admin/login
{
  "adminId": "superadmin",
  "password": "Super@Admin123"
}

// Response
{
  "access_token": "jwt_token_here",
  "admin": {
    "adminId": "superadmin",
    "name": "Super Administrator",
    "role": "super_admin"
  }
}
```

## 🎪 Admin Roles

- **super_admin**: Full system access, can manage all features
- **admin**: Standard admin access, limited permissions

## 📊 Current Status
✅ All accounts created successfully  
✅ All logins tested and working  
✅ Connected to production database  

---
*Generated on: August 28, 2025*
