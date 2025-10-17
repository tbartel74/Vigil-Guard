# Contributing to Vigil Guard

Thank you for your interest in contributing to Vigil Guard! This document provides guidelines and instructions for contributing to the project.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md):
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences
- Follow ethical security research practices
- Use attack examples only for defensive purposes

Please read the complete [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for detailed community guidelines and security research policies.

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18.0.0
- Docker & Docker Compose
- Git
- Familiarity with TypeScript, React, and Express.js

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/vigil-guard.git
   cd vigil-guard
   ```

2. **Install dependencies**
   ```bash
   # Web UI Frontend
   cd services/web-ui/frontend
   npm install

   # Web UI Backend
   cd ../backend
   npm install
   ```

3. **Start development services**
   ```bash
   # Create Docker network
   docker network create vigil-network

   # Start all services using main docker-compose
   docker-compose up -d

   # Or start individual services
   cd services/monitoring
   docker-compose up -d

   cd ../workflow
   docker-compose up -d

   # Start Web UI in development mode
   cd ../web-ui/frontend
   npm run dev

   # In another terminal
   cd ../web-ui/backend
   npm run dev
   ```

## 📋 Development Guidelines

### Code Style

- **TypeScript**: Use strict mode, avoid `any` types
- **React**: Use functional components with hooks
- **Formatting**: Use consistent indentation (2 spaces)
- **Naming**: Use descriptive variable and function names
  - camelCase for variables and functions
  - PascalCase for components and types
  - UPPER_SNAKE_CASE for constants

### Git Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise commit messages
   - Keep commits atomic and focused
   - Follow conventional commits format

3. **Test your changes**
   ```bash
   # Run TypeScript compiler
   cd services/web-ui/frontend
   npx tsc --noEmit

   cd ../backend
   npx tsc --noEmit
   ```

4. **Commit with descriptive messages**
   ```bash
   git add .
   git commit -m "feat: add new detection pattern for XYZ"
   ```

5. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(web-ui): add dark mode toggle to settings page
fix(backend): resolve ETag validation issue on concurrent updates
docs(readme): update installation instructions for Windows
feat(workflow): add new detection pattern for polyglot attacks
fix(monitoring): correct ClickHouse query performance issue
```

## 🔒 Critical Files - Modify with Care

⚠️ **The following directories contain critical detection patterns and security rules:**

### Configuration Files (`services/workflow/config/`)
- `unified_config.json` - Main security policies
- `thresholds.config.json` - Decision thresholds (0-100 scale)
- `rules.config.json` - Detection patterns
- `allowlist.schema.json` - Allowlist validation schema
- `normalize.conf` - Normalization mappings
- `pii.conf` - PII redaction patterns

**Important:**
- Always use the Web UI for configuration changes when possible
- Changes to these files directly affect security posture
- Test configuration changes thoroughly before deploying
- Document the rationale for threshold adjustments
- Maintain backup copies before modifying

### Security-Critical Code
- `services/web-ui/backend/src/auth.ts` - Authentication logic
- `services/web-ui/backend/src/fileOps.ts` - File operations (path traversal protection)
- `services/web-ui/backend/src/database.ts` - User database operations

Changes to these files require security review. See [SECURITY.md](docs/SECURITY.md) for security considerations.

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, verify:

- [ ] Frontend builds without errors (`npm run build`)
- [ ] Backend compiles without TypeScript errors
- [ ] Changes work in both development and production mode
- [ ] No console errors or warnings
- [ ] Configuration changes persist correctly
- [ ] ETag validation works for concurrent edits
- [ ] Docker services start without errors

### Testing Configuration Changes

1. Start all services
2. Access Web UI at http://localhost/ui/ (production) or http://localhost:5173/ (dev)
3. Login with credentials (default: admin/admin123)
4. Navigate to Configuration section
5. Modify configuration variables
6. Verify changes are saved with proper ETag validation
7. Check that n8n workflow processes requests correctly (http://localhost:5678)
8. Verify ClickHouse logging works (http://localhost:8123/ping)
9. Confirm Grafana dashboards display data (http://localhost/grafana/)

## 📚 Documentation

When adding new features:

1. **Update relevant documentation** in `docs/`
2. **Add inline code comments** for complex logic
3. **Update API documentation** if adding/modifying endpoints
4. **Update architecture documentation** if changing architecture

## 🐛 Bug Reports

We use GitHub Issue Templates to streamline bug reporting. Please use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml) which includes:

1. **Description**: Clear description of the issue
2. **Steps to reproduce**: Numbered steps to reproduce the behavior
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Affected Component**: Web UI, Backend, n8n, Monitoring, etc.
6. **Severity**: Critical, High, Medium, Low
7. **Environment**:
   - OS and version
   - Docker version
   - Browser (for frontend issues)
   - Vigil Guard version
8. **Screenshots**: If applicable
9. **Logs**: Relevant error messages or logs (redact sensitive data!)

**Important:** Before opening a bug report, search existing issues to avoid duplicates.

## 💡 Feature Requests

We use GitHub Issue Templates for feature requests. Please use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) which includes:

1. **Problem Statement**: What problem does this feature solve?
2. **Proposed Solution**: Describe your ideal solution
3. **Affected Component**: Which part of Vigil Guard would this impact?
4. **Priority**: Critical, High, Medium, Low
5. **Alternatives**: Other approaches you've considered
6. **Use Cases**: Specific scenarios where this would be valuable
7. **Implementation Ideas**: (Optional) How this could be implemented
8. **Additional context**: Mockups, wireframes, or references

## 📝 Documentation Issues

Found an issue in documentation? Use the [Documentation Issue template](.github/ISSUE_TEMPLATE/documentation.yml) to report:

- Incorrect or outdated information
- Missing documentation
- Unclear explanations
- Broken links
- Code examples that don't work

Include the file path, line number, current content, and suggested fix.

## 🔍 Code Review Process

All submissions require code review:

1. **Automated checks**: CI/CD pipeline must pass
2. **Code review**: At least one maintainer approval required
3. **Testing**: Verify changes work as expected
4. **Documentation**: Ensure docs are updated
5. **Merge**: Maintainer merges the PR

## 📦 Pull Request Checklist

We provide a comprehensive [Pull Request template](.github/pull_request_template.md) that includes:

**Pre-submission checklist:**
- [ ] Code follows project style guidelines
- [ ] Commit messages follow conventional commits format
- [ ] All tests pass locally (TypeScript compilation, manual testing)
- [ ] Documentation is updated (docs/, README.md, inline comments)
- [ ] No unnecessary files are included (build artifacts, etc.)
- [ ] Branch is up to date with main branch
- [ ] PR description clearly explains the changes
- [ ] Related issues are referenced in PR description
- [ ] Security implications have been reviewed
- [ ] Configuration changes are documented with migration guide (if breaking)
- [ ] Performance impact is considered and acceptable

**The PR template includes sections for:**
- Type of change (bug fix, feature, breaking change, etc.)
- Testing performed (test environment, test cases, manual steps)
- Configuration changes (impact on deployments, migration guide)
- Security considerations
- Documentation updates
- Performance impact
- Breaking changes

Please fill out all relevant sections to expedite the review process.

## 🔐 Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Please follow our [Security Policy](docs/SECURITY.md) for responsible disclosure:

1. **Report privately** using [GitHub Security Advisories](https://github.com/tbartel74/Vigil-Guard/security/advisories/new)
2. **Include detailed information**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)
3. **Allow reasonable time** for patching before public disclosure
4. **Follow coordinated disclosure** practices

For detailed security guidelines, including default credentials, authentication, and hardening practices, see [docs/SECURITY.md](docs/SECURITY.md).

**Ethical Security Research:**
- Vigil Guard is a defensive security platform
- Attack examples in code/docs are for educational purposes only
- Do not use techniques against unauthorized systems
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) security research guidelines

## 📞 Getting Help

If you need help:

- **Documentation**: Check the [docs/](docs/) directory:
  - [QUICKSTART.md](QUICKSTART.md) - Quick installation guide
  - [docs/INSTALLATION.md](docs/INSTALLATION.md) - Complete installation instructions
  - [docs/CONFIGURATION.md](docs/CONFIGURATION.md) - Configuration reference
  - [docs/API.md](docs/API.md) - REST API documentation
  - [docs/SECURITY.md](docs/SECURITY.md) - Security best practices
  - [docs/architecture/architecture.md](docs/architecture/architecture.md) - System architecture
- **Existing Issues**: [Search GitHub Issues](https://github.com/tbartel74/Vigil-Guard/issues) for similar problems
- **GitHub Discussions**: [Join community discussions](https://github.com/tbartel74/Vigil-Guard/discussions)
- **Issue Templates**: Use our templates for [bugs](.github/ISSUE_TEMPLATE/bug_report.yml), [features](.github/ISSUE_TEMPLATE/feature_request.yml), or [documentation](.github/ISSUE_TEMPLATE/documentation.yml)

## 🎯 Areas for Contribution

We welcome contributions in:

- **Detection Patterns**: Improve threat detection accuracy (new rules, better thresholds)
- **UI/UX**: Enhance user interface and experience (Web UI, accessibility, mobile support)
- **Documentation**: Improve or translate documentation (guides, API docs, examples)
- **Testing**: Add test coverage (unit tests, integration tests, E2E tests)
- **Performance**: Optimize processing speed (workflow efficiency, ClickHouse queries)
- **Bug Fixes**: Fix reported issues (use GitHub Issues with bug label)
- **Features**: Implement new capabilities (see roadmap and feature requests)
- **Security**: Enhance security controls (authentication, authorization, input validation)
- **Monitoring**: Improve analytics and dashboards (Grafana panels, ClickHouse queries)
- **ML/AI**: Enhance Prompt Guard API (model improvements, new detection techniques)

**Good First Issues:**
- Look for issues labeled `good first issue` or `help wanted`
- Documentation improvements are always welcome
- UI/UX enhancements (especially accessibility)
- Test coverage additions

## 📄 License

By contributing to Vigil Guard, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You

Thank you for contributing to Vigil Guard and helping make LLM applications more secure! Your contributions help protect AI systems worldwide.

---

## 📚 Additional Resources

- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines and security research ethics
- [Security Policy](docs/SECURITY.md) - Security best practices and vulnerability reporting
- [Architecture Documentation](docs/architecture/architecture.md) - System design and C4 diagrams
- [API Reference](docs/API.md) - Complete REST API documentation
- [CODEOWNERS](.github/CODEOWNERS) - Code ownership and review assignments

**Questions?**
- Search [GitHub Issues](https://github.com/tbartel74/Vigil-Guard/issues)
- Join [GitHub Discussions](https://github.com/tbartel74/Vigil-Guard/discussions)
- Review our [documentation](docs/)
