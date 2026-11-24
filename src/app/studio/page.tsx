import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Studiya" };

// ?demo=<template>&channel=<t.me link> are read on the client, so the shell stays static.
export default function StudioPage() {
  return <Studio />;
}
