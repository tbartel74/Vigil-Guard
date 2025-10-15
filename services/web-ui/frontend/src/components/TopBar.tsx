import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMobile } from "../context/MobileContext";
import vigilLogo from "../assets/vigil_logo.png";

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
            className="w-8 h-8 rounded-full object-cover"
            style={{ clipPath: 'circle(50%)' }}
          />
          <div>
            <div className="text-lg font-bold tracking-tight text-white">
              Vigil Guard
            </div>
            <div className="text-xs text-slate-500">Enterprise Security Platform</div>
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-6">
        {user && (
          <div className="relative" ref={dropdownRef}>
            <div
              className="flex items-center gap-4 cursor-pointer hover:bg-slate-800/50 px-3 py-2 rounded-lg transition-colors"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <div className="text-right">
                <div className="text-sm text-white font-medium">{user.username}</div>
                <div className="text-xs text-slate-500">{user.role === 'admin' ? 'Administrator' : 'User'}</div>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                {user.username[0].toUpperCase()}
              </div>
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-700">
                  <div className="text-sm font-medium text-white">{user.username}</div>
                  <div className="text-xs text-slate-400">{user.email}</div>
                </div>
                <div className="py-1">
                  {/* Permissions Info */}
                  <div className="px-4 py-2 border-b border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">Permissions:</div>
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
                    onClick={openSettings}
                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                  >
                    🚪 Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">System Status</div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}