import React, { useState, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  last_login?: string;
  is_active: boolean;
  can_view_monitoring: boolean;
  can_view_configuration: boolean;
  can_manage_users: boolean;
  force_password_change: boolean;
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    can_view_monitoring: false,
    can_view_configuration: false,
    can_manage_users: false
  });

  useEffect(() => {
    loadUsers();
  }, []);

  // ESC key handler for modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModals();
      }
    };
    if (isCreateModalOpen || isEditModalOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isCreateModalOpen, isEditModalOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getUsers();
      setUsers(response.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Creating user...');
    try {
      await api.createUser(formData);
      toast.success(`User "${formData.username}" created successfully`, { id: toastId });
      setIsCreateModalOpen(false);
      resetForm();
      loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create user';
      toast.error(errorMsg, { id: toastId });
      setError(errorMsg);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const toastId = toast.loading('Updating user...');
    try {
      const updates: any = {
        username: formData.username,
        email: formData.email,
        role: formData.role,
        can_view_monitoring: formData.can_view_monitoring,
        can_view_configuration: formData.can_view_configuration,
        can_manage_users: formData.can_manage_users
      };

      if (formData.password) {
        updates.password = formData.password;
      }

      await api.updateUser(selectedUser.id, updates);
      toast.success(`User "${selectedUser.username}" updated successfully`, { id: toastId });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      resetForm();
      loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to update user';
      toast.error(errorMsg, { id: toastId });
      setError(errorMsg);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    const toastId = toast.loading('Deleting user...');
    try {
      await api.deleteUser(userId);
      toast.success('User deleted successfully', { id: toastId });
      loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to delete user';
      toast.error(errorMsg, { id: toastId });
      setError(errorMsg);
    }
  };

  const handleToggleActive = async (userId: number) => {
    const toastId = toast.loading('Updating user status...');
    try {
      await api.toggleUserActive(userId);
      toast.success('User status updated successfully', { id: toastId });
      loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to toggle user status';
      toast.error(errorMsg, { id: toastId });
      setError(errorMsg);
    }
  };

  const handleForcePasswordChange = async (userId: number) => {
    if (!confirm('Force this user to change their password on next login?')) return;

    const toastId = toast.loading('Forcing password change...');
    try {
      await api.forcePasswordChange(userId);
      toast.success('User will be required to change password on next login', { id: toastId });
      loadUsers();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to force password change';
      toast.error(errorMsg, { id: toastId });
      setError(errorMsg);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      can_view_monitoring: user.can_view_monitoring,
      can_view_configuration: user.can_view_configuration,
      can_manage_users: user.can_manage_users
    });
    setIsEditModalOpen(true);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'user',
      can_view_monitoring: false,
      can_view_configuration: false,
      can_manage_users: false
    });
  };

  const closeModals = () => {
    setIsEditModalOpen(false);
    setIsCreateModalOpen(false);
    setSelectedUser(null);
    resetForm();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">User Management</h1>
          <p className="text-slate-400 mt-2">Manage system users and permissions</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Permissions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium">{user.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-white">{user.username}</div>
                      {user.id === currentUser?.id && (
                        <span className="text-xs text-blue-400">(You)</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-600/50 text-slate-300'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.can_view_monitoring && (
                      <span className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded">Monitoring</span>
                    )}
                    {user.can_view_configuration && (
                      <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded">Config</span>
                    )}
                    {user.can_manage_users && (
                      <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded">User Admin</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    user.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(user.id)}
                      className="text-yellow-400 hover:text-yellow-300 transition-colors"
                      disabled={user.id === currentUser?.id}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleForcePasswordChange(user.id)}
                      className="text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      Force PW
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      disabled={user.id === currentUser?.id}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-user-title"
              className="bg-slate-800 rounded-2xl p-8 max-w-lg w-full mx-4 border border-slate-700"
            >
              <h2 id="create-user-title" className="text-2xl font-semibold text-white mb-6">Create New User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">Permissions</label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_monitoring}
                    onChange={(e) => setFormData({ ...formData, can_view_monitoring: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Access to monitoring dashboard</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_configuration}
                    onChange={(e) => setFormData({ ...formData, can_view_configuration: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Access to system configuration</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_manage_users}
                    onChange={(e) => setFormData({ ...formData, can_manage_users: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Manage users and permissions</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Create User
                </button>
              </div>
            </form>
            </div>
          </FocusTrap>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-user-title"
              className="bg-slate-800 rounded-2xl p-8 max-w-lg w-full mx-4 border border-slate-700"
            >
              <h2 id="edit-user-title" className="text-2xl font-semibold text-white mb-6">Edit User: {selectedUser.username}</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">New Password (leave empty to keep current)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty to keep current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">Permissions</label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_monitoring}
                    onChange={(e) => setFormData({ ...formData, can_view_monitoring: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Access to monitoring dashboard</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_configuration}
                    onChange={(e) => setFormData({ ...formData, can_view_configuration: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Access to system configuration</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_manage_users}
                    onChange={(e) => setFormData({ ...formData, can_manage_users: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">Manage users and permissions</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
