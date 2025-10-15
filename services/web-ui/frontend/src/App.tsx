import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import TopBar from "./components/TopBar";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { user } = useAuth();

  return (
    <>
      <Toaster position="top-right" />
      <Layout
        header={<TopBar />}
        sidebar={
          <nav className="flex flex-col gap-2 p-4">
            <NavLink to="/" className={({ isActive }) => `px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>Monitoring</NavLink>
            <NavLink to="/config" className={({ isActive }) => `px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>Configuration</NavLink>
            {user?.can_manage_users && (
              <NavLink to="/administration" className={({ isActive }) => `px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>Administration</NavLink>
            )}
            <NavLink to="/help" className={({ isActive }) => `px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>Help</NavLink>
          </nav>
        }
      >
        <Outlet />
      </Layout>
    </>
  );
}