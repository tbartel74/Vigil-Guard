import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { userDb } from './database.js';
import {
  generateToken,
  hashPassword,
  comparePassword,
  authenticate,
  authorize
} from './auth.js';

const router = Router();

// Rate limiter for login endpoint - prevents brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Rate limiter for password change - prevents password grinding attacks
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per window (stricter than login)
  message: { error: 'Too many password change attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to check if user has permission to manage users
function requireUserManagement(req: Request, res: Response, next: Function) {
  const user = (req as any).user;

  if (!user || !user.can_manage_users) {
    return res.status(403).json({ error: 'Access denied. User management permission required.' });
  }

  next();
}

// Login endpoint (rate limited - 5 attempts per 15 minutes)
router.post('/login', loginLimiter as any, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username or email
    let user = userDb.getUserByUsername(username);
    if (!user) {
      user = userDb.getUserByEmail(username);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user);

    // Create session in database
    userDb.createSession(user.id!, token);

    // Update last login
    userDb.updateLastLogin(user.id!);

    // Return user info and token
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        can_view_monitoring: user.can_view_monitoring,
        can_view_configuration: user.can_view_configuration,
        can_manage_users: user.can_manage_users,
        force_password_change: user.force_password_change,
        timezone: user.timezone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    // Delete session from database
    if (req.token) {
      userDb.deleteSession(req.token);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Register endpoint (admin only)
router.post('/register', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }

    // Check if user already exists
    if (userDb.getUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (userDb.getUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const isAdmin = role === 'admin';
    const userId = await userDb.createUser({
      username,
      email,
      password_hash: hashedPassword,
      role,
      is_active: true,
      can_view_monitoring: isAdmin,
      can_view_configuration: isAdmin,
      can_manage_users: isAdmin,
      force_password_change: false,
      timezone: 'UTC'
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get current user info
router.get('/me', authenticate, async (req: Request, res: Response) => {
  res.json({
    id: req.user!.id,
    username: req.user!.username,
    email: req.user!.email,
    role: req.user!.role,
    created_at: req.user!.created_at,
    last_login: req.user!.last_login
  });
});

// Change password (rate limited - 3 attempts per 15 minutes)
router.post('/change-password', passwordChangeLimiter as any, authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, req.user!.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const hashedPassword = await hashPassword(newPassword);
    userDb.updatePassword(req.user!.id!, hashedPassword);

    // Invalidate all sessions for this user
    userDb.deleteUserSessions(req.user!.id!);

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get all users (requires user management permission)
router.get('/users', authenticate, requireUserManagement, async (req: Request, res: Response) => {
  try {
    const users = userDb.getAllUsers();

    // Remove password hashes and convert SQLite integers to booleans
    const sanitizedUsers = users.map(({ password_hash, ...user }) => ({
      ...user,
      is_active: !!user.is_active,
      can_view_monitoring: !!user.can_view_monitoring,
      can_view_configuration: !!user.can_view_configuration,
      can_manage_users: !!user.can_manage_users,
      force_password_change: !!user.force_password_change
    }));

    res.json({ success: true, users: sanitizedUsers });
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user (requires user management permission)
router.delete('/users/:id', authenticate, requireUserManagement, (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const currentUser = (req as any).user;

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const userToDelete = userDb.getUserById(userId);
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this is the last user with management permission
    if (userToDelete.can_manage_users && !userDb.canRemoveUserManagementPermission(userId)) {
      return res.status(400).json({
        error: 'Cannot delete this user. At least one active user must have user management permission.'
      });
    }

    userDb.deleteUser(userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Verify token endpoint
router.get('/verify', authenticate, async (req: Request, res: Response) => {
  res.json({
    valid: true,
    user: {
      id: req.user!.id,
      username: req.user!.username,
      email: req.user!.email,
      role: req.user!.role,
      can_view_monitoring: req.user!.can_view_monitoring,
      can_view_configuration: req.user!.can_view_configuration,
      can_manage_users: req.user!.can_manage_users,
      force_password_change: req.user!.force_password_change,
      timezone: req.user!.timezone
    }
  });
});

// Update user settings (timezone)
router.put('/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const { timezone } = req.body;
    const userId = req.user!.id!;

    if (!timezone) {
      return res.status(400).json({ error: 'Timezone is required' });
    }

    userDb.updateUser(userId, { timezone });

    const updatedUser = userDb.getUserById(userId);
    const { password_hash, ...sanitizedUser } = updatedUser!;

    res.json({ success: true, user: sanitizedUser });
  } catch (error: any) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Create new user (requires user management permission)
router.post('/users', authenticate, requireUserManagement, async (req: Request, res: Response) => {
  try {
    const { username, email, password, role, can_view_monitoring, can_view_configuration, can_manage_users } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if username or email already exists
    if (userDb.getUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (userDb.getUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password (uses bcrypt with 12 rounds - OWASP recommendation)
    const hashedPassword = await hashPassword(password);

    // Create user
    const userId = await userDb.createUser({
      username,
      email,
      password_hash: hashedPassword,
      role: role || 'user',
      is_active: true,
      can_view_monitoring: can_view_monitoring || false,
      can_view_configuration: can_view_configuration || false,
      can_manage_users: can_manage_users || false,
      force_password_change: false,
      timezone: 'UTC'
    });

    const newUser = userDb.getUserById(userId);
    const { password_hash, ...sanitizedUser } = newUser!;

    // Convert SQLite integers to booleans
    const userWithBooleans = {
      ...sanitizedUser,
      is_active: !!sanitizedUser.is_active,
      can_view_monitoring: !!sanitizedUser.can_view_monitoring,
      can_view_configuration: !!sanitizedUser.can_view_configuration,
      can_manage_users: !!sanitizedUser.can_manage_users,
      force_password_change: !!sanitizedUser.force_password_change
    };

    res.status(201).json({ success: true, user: userWithBooleans });
  } catch (error: any) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (requires user management permission)
router.put('/users/:id', authenticate, requireUserManagement, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const updates = req.body;

    const existingUser = userDb.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if trying to remove user management permission
    // Current state: user HAS the permission
    // New state: user will NOT have the permission (false, 0, or any falsy value)
    const currentlyHasPermission = !!existingUser.can_manage_users;
    const willHavePermission = updates.can_manage_users !== undefined
      ? !!updates.can_manage_users
      : currentlyHasPermission;

    if (currentlyHasPermission && !willHavePermission) {
      // Trying to remove permission - check if there are other users with this permission
      if (!userDb.canRemoveUserManagementPermission(userId)) {
        return res.status(400).json({
          error: 'Cannot remove user management permission. At least one active user must have this permission.'
        });
      }
    }

    // If password is being updated, hash it (uses bcrypt with 12 rounds)
    if (updates.password) {
      updates.password_hash = await hashPassword(updates.password);
      delete updates.password;
    }

    // Update user
    userDb.updateUser(userId, updates);

    const updatedUser = userDb.getUserById(userId);
    const { password_hash, ...sanitizedUser } = updatedUser!;

    // Convert SQLite integers to booleans
    const userWithBooleans = {
      ...sanitizedUser,
      is_active: !!sanitizedUser.is_active,
      can_view_monitoring: !!sanitizedUser.can_view_monitoring,
      can_view_configuration: !!sanitizedUser.can_view_configuration,
      can_manage_users: !!sanitizedUser.can_manage_users,
      force_password_change: !!sanitizedUser.force_password_change
    };

    res.json({ success: true, user: userWithBooleans });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Toggle user active status (requires user management permission)
router.post('/users/:id/toggle-active', authenticate, requireUserManagement, (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const currentUser = (req as any).user;

    // Prevent self-deactivation
    if (userId === currentUser.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const userToToggle = userDb.getUserById(userId);
    if (!userToToggle) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If deactivating a user with management permission, check if there are others
    if (userToToggle.is_active && userToToggle.can_manage_users) {
      if (!userDb.canRemoveUserManagementPermission(userId)) {
        return res.status(400).json({
          error: 'Cannot deactivate this user. At least one active user must have user management permission.'
        });
      }
    }

    userDb.toggleUserActive(userId);

    const updatedUser = userDb.getUserById(userId);
    const { password_hash, ...sanitizedUser } = updatedUser!;

    // Convert SQLite integers to booleans
    const userWithBooleans = {
      ...sanitizedUser,
      is_active: !!sanitizedUser.is_active,
      can_view_monitoring: !!sanitizedUser.can_view_monitoring,
      can_view_configuration: !!sanitizedUser.can_view_configuration,
      can_manage_users: !!sanitizedUser.can_manage_users,
      force_password_change: !!sanitizedUser.force_password_change
    };

    res.json({ success: true, user: userWithBooleans });
  } catch (error: any) {
    console.error('Toggle user active error:', error);
    res.status(500).json({ error: 'Failed to toggle user active status' });
  }
});

// Force password change (requires user management permission)
router.post('/users/:id/force-password-change', authenticate, requireUserManagement, (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    const user = userDb.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    userDb.setForcePasswordChange(userId, true);

    res.json({ success: true, message: 'User will be required to change password on next login' });
  } catch (error: any) {
    console.error('Force password change error:', error);
    res.status(500).json({ error: 'Failed to set force password change' });
  }
});

export default router;
