## Description

<!-- Provide a clear and concise description of your changes -->

**Type of Change:**
<!-- Mark the relevant option with an [x] -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring (no functional changes)
- [ ] Security enhancement
- [ ] Configuration change
- [ ] CI/CD or tooling update

## Related Issues

<!-- Link to related issues using #issue_number -->

Closes #
Relates to #

## Motivation and Context

<!-- Why is this change required? What problem does it solve? -->

## Changes Made

<!-- List the specific changes in this PR -->

-
-
-

## Testing Performed

<!-- Describe the testing you've done to verify your changes -->

### Test Environment

- **OS**: [e.g., Ubuntu 22.04, macOS 13.0]
- **Docker Version**: [e.g., 24.0.5]
- **Browser** (if Web UI): [e.g., Chrome 120]
- **Vigil Guard Version**: [e.g., commit SHA or branch]

### Test Cases

<!-- List test cases and results -->

- [ ] Test Case 1: [Description]
  - **Expected**: [What should happen]
  - **Result**: [What actually happened]

- [ ] Test Case 2: [Description]
  - **Expected**: [What should happen]
  - **Result**: [What actually happened]

### Manual Testing Steps

<!-- How can reviewers manually test this? -->

```bash
# Example testing steps
docker-compose down
docker-compose up -d
docker-compose logs -f web-ui-backend
```

## Configuration Changes

<!-- If this PR changes configuration files, list them here -->

**Modified Configuration Files:**
- [ ] `services/workflow/config/thresholds.config.json`
- [ ] `services/workflow/config/unified_config.json`
- [ ] `services/workflow/config/rules.config.json`
- [ ] `.env` or docker-compose.yml
- [ ] Other: [specify]

**Impact on Existing Deployments:**
<!-- Will users need to update their configuration? -->

- [ ] No configuration changes required
- [ ] Optional configuration update (backwards compatible)
- [ ] Required configuration update (breaking change) - **provide migration guide**

**Migration Guide** (if applicable):
<!-- Provide step-by-step instructions for users to migrate -->

```bash
# Example migration steps
# 1. Backup current configuration
# 2. Update thresholds.config.json
# 3. Restart services
```

## Security Considerations

<!-- Address any security implications of this change -->

- [ ] This PR does not introduce security concerns
- [ ] Security implications have been reviewed (explain below)
- [ ] This PR fixes a security vulnerability (link to private disclosure)
- [ ] This PR has been reviewed against [SECURITY.md](../SECURITY.md)

**Security Notes:**
<!-- If applicable, describe security considerations -->

## Documentation Updates

<!-- Has documentation been updated to reflect these changes? -->

- [ ] Code documentation (comments, docstrings)
- [ ] README.md
- [ ] docs/INSTALLATION.md
- [ ] docs/CONFIGURATION.md
- [ ] docs/API.md
- [ ] docs/architecture/architecture.md
- [ ] prompt-guard-api/README.md
- [ ] Other: [specify]
- [ ] No documentation update required

## Performance Impact

<!-- Does this change affect performance? -->

- [ ] No performance impact
- [ ] Performance improvement (describe below)
- [ ] Performance degradation (justify below)

**Performance Notes:**
<!-- If applicable, provide benchmarks or profiling results -->

## Breaking Changes

<!-- Does this PR introduce breaking changes? -->

- [ ] No breaking changes
- [ ] Breaking changes (describe below)

**Breaking Change Details:**
<!-- List breaking changes and how users should adapt -->

1.
2.

## Checklist

<!-- Ensure all items are completed before requesting review -->

### Code Quality

- [ ] My code follows the project's coding style and conventions
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have removed any console.log or debug statements
- [ ] TypeScript compilation passes without errors (`npm run build`)

### Testing

- [ ] I have tested my changes thoroughly
- [ ] All existing tests pass
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] I have tested edge cases and error conditions
- [ ] I have tested on multiple browsers (if frontend change)

### Security

- [ ] I have reviewed the [Security Policy](../SECURITY.md)
- [ ] I have not committed sensitive data (credentials, API keys, secrets)
- [ ] I have not introduced SQL injection, XSS, or path traversal vulnerabilities
- [ ] I have validated all user inputs appropriately
- [ ] This PR does not weaken existing security controls

### Documentation

- [ ] I have updated relevant documentation
- [ ] I have added inline comments for complex logic
- [ ] I have updated the CHANGELOG (if applicable)

### Configuration

- [ ] I have tested configuration changes in a clean environment
- [ ] I have provided migration instructions for breaking config changes
- [ ] I have updated `.env.example` if new environment variables were added
- [ ] I have verified ETag validation works for config file changes (if applicable)

### Deployment

- [ ] Docker images build successfully
- [ ] docker-compose.yml changes are backwards compatible (or documented)
- [ ] Health checks pass for all modified services
- [ ] I have tested the deployment flow (stop → pull → up → verify)

## Screenshots / Recordings

<!-- If this PR includes UI changes, add screenshots or recordings -->

**Before:**
<!-- Screenshot or description of old behavior -->

**After:**
<!-- Screenshot or description of new behavior -->

## Additional Notes

<!-- Any additional information for reviewers -->

## Reviewer Checklist

<!-- For maintainers - items to verify during review -->

- [ ] Code quality and style are consistent with project standards
- [ ] Changes are well-tested and documented
- [ ] Security implications have been considered
- [ ] Performance impact is acceptable
- [ ] Breaking changes are properly documented
- [ ] Configuration changes are backwards compatible or migration guide provided
- [ ] Documentation is complete and accurate

---

## Thank You!

Thank you for contributing to Vigil Guard! Your efforts help make AI systems more secure for everyone.

**Questions?** See [CONTRIBUTING.md](../CONTRIBUTING.md) or ask in [GitHub Discussions](https://github.com/tbartel74/Vigil-Guard/discussions).
