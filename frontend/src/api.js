import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export const api = axios.create({
  baseURL: API,
  timeout: 60_000,
  withCredentials: true, // send session_token cookie on every request
});

// Helper: unwrap { status, data, error } for any endpoint call
export async function safeCall(fn) {
  try {
    const res = await fn();
    return { ok: true, status: res.status, data: res.data, error: null };
  } catch (e) {
    return {
      ok: false,
      status: e?.response?.status ?? 0,
      data: e?.response?.data ?? null,
      error: e?.response?.data?.detail || e.message || "Request failed",
    };
  }
}
