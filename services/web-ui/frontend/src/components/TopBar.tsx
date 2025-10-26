import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FocusTrap } from "focus-trap-react";
import { useAuth } from "../context/AuthContext";
import { useMobile } from "../context/MobileContext";

const vigilLogo = "/ui/vigil_logo.png";

export default function TopBar() {
  const { user, logout } = useAuth();
  const { isMobile, toggleSidebar } = useMobile();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const openSettings = () => {
    setIsDropdownOpen(false);
    navigate('/settings');
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && isDropdownOpen) {
      setIsDropdownOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <div className="h-14 px-4 flex items-center justify-between bg-surface-darkest border-b border-slate-800">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-6 h-6 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
          <img
            src={vigilLogo}
            alt="Vigil Logo"
            className="w-10 h-10 rounded-full object-contain bg-white/10 p-1"
          />
          <div>
            <div className="text-lg font-bold tracking-tight text-white">
              Vigil Guard
            </div>
            <div className="text-xs text-text-secondary">Enterprise Security Platform</div>
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-6">
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              id="user-menu-button"
              className="flex items-center gap-4 hover:bg-slate-800/50 px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-darkest"
              onClick={toggleDropdown}
              onKeyDown={handleKeyDown}
              aria-haspopup="true"
              aria-expanded={isDropdownOpen}
              aria-label="User menu"
            >
              <div className="text-right">
                <div className="text-sm text-white font-medium">{user.username}</div>
                <div className="text-xs text-text-secondary">{user.role === 'admin' ? 'Administrator' : 'User'}</div>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                {user.username[0].toUpperCase()}
              </div>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: '#menu-settings',
                  escapeDeactivates: true,
                  clickOutsideDeactivates: true,
                  onDeactivate: () => setIsDropdownOpen(false),
                  allowOutsideClick: true,
                }}
              >
                <div
                  className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="user-menu-button"
                >
                  <div className="px-4 py-3 border-b border-slate-700">
                    <div className="text-sm font-medium text-white">{user.username}</div>
                    <div className="text-xs text-text-secondary">{user.email}</div>
                  </div>
                  <div className="py-1">
                    {/* Permissions Info */}
                    <div className="px-4 py-2 border-b border-slate-700">
                      <div className="text-xs text-text-secondary mb-2">Permissions:</div>
                      <div className="flex flex-wrap gap-1">
                        {user.can_view_monitoring && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">Monitoring</span>
                        )}
                        {user.can_view_configuration && (
                          <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded">Config</span>
                        )}
                        {user.can_manage_users && (
                          <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded">User Admin</span>
                        )}
                      </div>
                    </div>

                    <button
                      id="menu-settings"
                      onClick={openSettings}
                      role="menuitem"
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors focus:outline-none focus-visible:bg-slate-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      ⚙️ Settings
                    </button>
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors focus:outline-none focus-visible:bg-slate-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      🚪 Logout
                    </button>
                  </div>
                </div>
              </FocusTrap>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="text-xs text-text-secondary">System Status</div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}