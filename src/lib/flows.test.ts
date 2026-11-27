import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOW_ROUTES, OVERLAYS, matchFlow, resolveFlow } from './flows';

function appRoutePaths(): string[] {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  return [...source.matchAll(/path="([^"]+)"/g)].map((match) => match[1]);
}

describe('flow registry', () => {
  it('tags every route in App.tsx with a flow, step, and screen', () => {
    const appPaths = appRoutePaths();
    const registryPaths = FLOW_ROUTES.map((route) => route.path);
    expect(appPaths.slice().sort()).toEqual(registryPaths.slice().sort());
    for (const route of FLOW_ROUTES) {
      expect(route.flow.trim(), route.path).not.toBe('');
      expect(route.step.trim(), route.path).not.toBe('');
      expect(route.screen.trim(), route.path).not.toBe('');
      if (route.path === '*') continue;
      const sample = route.path.replace(/:[^/]+/g, 'sample');
      const matched = matchFlow(sample);
      expect(matched?.flow).toBe(route.flow);
      expect(matched?.step).toBe(route.step);
      expect(matched?.screen).toBe(route.screen);
    }
  });

  it('does not let a param route swallow a more specific screen', () => {
    expect(matchFlow('/knowledge/new')?.step).toBe('new-note');
    expect(matchFlow('/knowledge/kb-laundry')?.step).toBe('note-detail');
    expect(matchFlow('/knowledge/kb-laundry')?.entityIds).toEqual({ id: 'kb-laundry' });
    expect(matchFlow('/visits/visit-1')?.entityIds).toEqual({ id: 'visit-1' });
    expect(matchFlow('/voice/sp-maria')?.entityIds).toEqual({ spId: 'sp-maria' });
  });

  it('tags every dialog and multi-step form', () => {
    for (const [id, overlay] of Object.entries(OVERLAYS)) {
      expect(overlay.step.trim(), id).not.toBe('');
      expect(overlay.screen.trim(), id).not.toBe('');
      const resolved = resolveFlow('/visits/visit-1', id);
      expect(resolved.step).toBe(overlay.step);
      expect(resolved.screen).toBe(overlay.screen);
      expect(resolved.flow).toBe(overlay.flow ?? 'visits');
      expect(resolved.routeStep).toBe('detail');
      expect(resolved.entityIds).toEqual({ id: 'visit-1' });
    }
    expect(() => resolveFlow('/', 'missing-step')).toThrow(/Unknown overlay step/);
  });
});
