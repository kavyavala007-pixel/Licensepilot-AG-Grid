// src/lib/api.js — how the website (frontend) talks to the server (backend).
//
// The browser sends a request to a URL like /api/customers. The server answers
// with JSON (plain text data). These helpers hide the repeated fetch() code.

import { useEffect, useRef } from "react";

// Call the server. With a body it sends a POST, otherwise a GET.
export const api = async (path, body, method) => {
  const response = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

export const money = (n) => "$" + Number(n || 0).toLocaleString();

export const relTime = (iso) => {
  const seconds = (Date.now() - new Date(iso)) / 1000;
  if (seconds < 60) return "just now";
  const ago = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
  if (seconds < 86400) return ago(Math.floor(seconds / 3600), "hour");
  return ago(Math.floor(seconds / 86400), "day");
};

// Live updates: the server pushes events (new payment, autopilot decision)
// over one long-lived connection called Server-Sent Events (SSE).
export function useLiveEvents(onEvent) {
  const callbackRef = useRef(onEvent);
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (message) => {
      try {
        callbackRef.current(JSON.parse(message.data));
      } catch (error) {
        console.error("Invalid live event:", error);
      }
    };
    // The browser reconnects by itself if the connection drops.
    source.onerror = () => {};
    return () => source.close();
  }, []);
}

// Turn the activity list into a CSV file the browser downloads.
export function downloadCsv(fileName, rows, columns) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => quote(row[column])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// One shared checker for "which paid AG Grid packages does this project use?"
// Used by both the Licence Advisor and the project check, so they always agree.
export const PAID_PACKAGES = [
  { pkg: "ag-grid-enterprise", product: "AG Grid Enterprise" },
  { pkg: "ag-charts-enterprise", product: "AG Charts Enterprise" },
];

export function readDependencies(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.packages) {
      // package-lock.json
      return Object.fromEntries(
        Object.keys(parsed.packages)
          .filter((name) => name.startsWith("node_modules/"))
          .map((name) => [name.slice("node_modules/".length), true]),
      );
    }
    if (
      parsed.dependencies ||
      parsed.devDependencies ||
      parsed.peerDependencies
    ) {
      // package.json
      return {
        ...parsed.dependencies,
        ...parsed.devDependencies,
        ...parsed.peerDependencies,
      };
    }
    throw new Error("No list of packages was found in this file.");
  } catch (error) {
    // yarn.lock / pnpm-lock style text files
    const entries = content.matchAll(
      /^\s{0,2}("?)(@[^/\s]+\/[^@\s]+|[a-zA-Z0-9._/-]+)@\S+("?):?\s*$/gm,
    );
    const deps = Object.fromEntries(
      [...entries].map((match) => [match[2], true]),
    );
    if (Object.keys(deps).length) return deps;
    throw error instanceof SyntaxError
      ? new Error("This doesn't look like a package.json or lock file.")
      : error;
  }
}

export function findPaidPackages(content) {
  const deps = readDependencies(content);
  return {
    total: Object.keys(deps).length,
    detected: PAID_PACKAGES.filter((p) => deps[p.pkg]),
  };
}
