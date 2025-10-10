# Contributing to Vigil Guard

Thank you for your interest in contributing to Vigil Guard! This document provides guidelines and instructions for contributing to the project.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences

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
   # GUI Frontend
   cd GUI/frontend
   npm install

   # GUI Backend
   cd ../backend
   npm install
   ```

3. **Start development services**
   ```bash
   # Create Docker network
   docker network create n8n-network

   # Start monitoring stack
   cd monitoring
   docker-compose up -d

   # Start n8n
   cd ../n8n
   docker-compose up -d

   # Start GUI in development mode
   cd ../GUI/frontend
   npm run dev

   # In another terminal
   cd ../GUI/backend
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
   cd GUI/frontend
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
feat(gui): add dark mode toggle to settings page
fix(backend): resolve ETag validation issue on concurrent updates
docs(readme): update installation instructions for Windows
```

## 🔒 Critical Files - DO NOT MODIFY

⚠️ **The following directory contains critical detection patterns and security rules:**

- `n8n/config_sanitizer/` - **DO NOT** modify:
  - Directory name
  - File names
  - File contents

These files contain carefully tuned detection patterns. Use the GUI for configuration changes instead.

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
2. Access GUI at http://localhost:5173
3. Modify configuration variables
4. Verify changes are saved
5. Check that n8n workflow processes requests correctly
6. Verify ClickHouse logging works
7. Confirm Grafana dashboards display data

## 📚 Documentation

When adding new features:

1. **Update relevant documentation** in `docs/`
2. **Add inline code comments** for complex logic
3. **Update API documentation** if adding/modifying endpoints
4. **Update architecture documentation** if changing architecture

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to reproduce**: Numbered steps to reproduce the behavior
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Environment**:
   - OS and version
   - Node.js version
   - Docker version
   - Browser (for frontend issues)
6. **Screenshots**: If applicable
7. **Logs**: Relevant error messages or logs

## 💡 Feature Requests

When proposing new features:

1. **Use case**: Explain the problem you're trying to solve
2. **Proposed solution**: Describe your proposed solution
3. **Alternatives**: Other approaches you've considered
4. **Additional context**: Any other relevant information

## 🔍 Code Review Process

All submissions require code review:

1. **Automated checks**: CI/CD pipeline must pass
2. **Code review**: At least one maintainer approval required
3. **Testing**: Verify changes work as expected
4. **Documentation**: Ensure docs are updated
5. **Merge**: Maintainer merges the PR

## 📦 Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] Commit messages follow conventional commits format
- [ ] All tests pass locally
- [ ] Documentation is updated
- [ ] No unnecessary files are included (build artifacts, etc.)
- [ ] Branch is up to date with main branch
- [ ] PR description clearly explains the changes
- [ ] Related issues are referenced in PR description

## 🔐 Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead, please report security issues privately to:
- Email: security@your-organization.com
- Include "SECURITY" in the subject line
- Provide detailed description and steps to reproduce

## 📞 Getting Help

If you need help:

- **Documentation**: Check the [docs/](docs/) directory
- **Existing Issues**: Search for similar issues
- **Discussions**: Join our community discussions
- **Questions**: Open an issue with the "question" label

## 🎯 Areas for Contribution

We welcome contributions in:

- **Detection Patterns**: Improve threat detection accuracy
- **UI/UX**: Enhance user interface and experience
- **Documentation**: Improve or translate documentation
- **Testing**: Add test coverage
- **Performance**: Optimize processing speed
- **Bug Fixes**: Fix reported issues
- **Features**: Implement new capabilities

## 📄 License

By contributing to Vigil Guard, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You

Thank you for contributing to Vigil Guard and helping make LLM applications more secure!

---

**Questions?** Open an issue with the "question" label or reach out to the maintainers.
