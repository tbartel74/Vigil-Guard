# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.8.x   | :white_check_mark: |
| 1.7.x   | :x:                |
| < 1.7   | :x:                |

## Reporting a Vulnerability

We take the security of Vigil Guard seriously. If you discover a security vulnerability, please follow these guidelines:

### How to Report

1. **Do NOT create a public GitHub issue** for security vulnerabilities
2. **Email**: Send details to security@vigilguard.local (or create a private security advisory on GitHub)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 5 business days
- **Status Updates**: At least every 7 days until resolution
- **Resolution Timeline**: Critical vulnerabilities within 30 days

### Disclosure Policy

- We follow coordinated disclosure practices
- Credit will be given to reporters (unless anonymity is requested)
- Public disclosure occurs after a fix is available and users have had time to update

## Security Best Practices

For deployment security guidelines, see [docs/SECURITY.md](docs/SECURITY.md).

### Quick Security Checklist

- [ ] All passwords auto-generated during installation (never use defaults)
- [ ] Changed Web UI admin password on first login
- [ ] Enabled HTTPS for production deployments
- [ ] Restricted network access with firewall rules
- [ ] Configured audit logging
- [ ] Regular security updates applied

## Security Features

Vigil Guard includes enterprise-grade security features:

- **Authentication**: JWT-based with bcrypt password hashing (12 rounds)
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Protection against brute-force attacks
- **Audit Logging**: Complete change history tracking
- **Input Validation**: Path traversal and injection prevention
- **Secret Management**: Auto-generated cryptographically secure credentials
- **Concurrency Control**: ETag-based conflict prevention

## Third-Party Dependencies

We regularly monitor and update dependencies for known vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

## Contact

For security-related questions that don't involve vulnerabilities, please use GitHub Discussions or Issues.
