import { describe, expect, it } from 'vitest';
import { approveKbProposal, declineKbProposal, requestKbChanges, reviseKbProposal, submitKbProposal } from './kbProposals';
import type { KbProposal } from './types';

const now = new Date('2026-11-27T12:00:00.000Z');

function pending(): KbProposal {
  const built = submitKbProposal({
    id: 'kbp-1',
    eventId: 'kbe-1',
    spId: 'sp-maria',
    clientId: 'client-alex',
    title: '  Espresso group head  ',
    body: 'Backflush the group head after the last shot. The tablets are in the tin above the machine.',
    category: 'kitchen',
    topic: 'Kitchen espresso',
    now,
  });
  if (!built.ok) throw new Error(built.reason);
  return built.proposal;
}

describe('provider knowledge proposals', () => {
  it('keeps a suggestion out of the knowledge base until the homeowner approves it', () => {
    const proposal = pending();
    expect(proposal.status).toBe('pending');
    expect(proposal.history).toHaveLength(1);
    expect(proposal.history[0].action).toBe('submitted');
    expect(proposal).not.toHaveProperty('publishedItemId');

    const declined = declineKbProposal(proposal, 'Not for the file', now, 'kbe-no');
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.proposal.status).toBe('declined');
    expect(declined.proposal.publishedItemId).toBeUndefined();
    expect(declined.proposal.history.map((event) => event.action)).toEqual(['submitted', 'declined']);
  });

  it('publishes the edited text with attribution and keeps the original submission', () => {
    const proposal = pending();
    const approved = approveKbProposal(
      proposal,
      { title: 'Backflush the espresso machine', body: 'After the last shot, backflush with a tablet from the tin above the machine.', note: 'Tightened the wording' },
      now,
      { eventId: 'kbe-yes', itemId: 'kb-new' },
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.item.contributedBy).toEqual({ spId: 'sp-maria', proposalId: 'kbp-1' });
    expect(approved.item.title).toBe('Backflush the espresso machine');
    expect(approved.item.body).not.toBe(proposal.body);
    expect(approved.proposal.publishedItemId).toBe('kb-new');
    expect(approved.proposal.history).toHaveLength(2);
    expect(approved.proposal.history[0].body).toBe(proposal.body);
    expect(approved.proposal.history[1].action).toBe('approved');
    expect(approved.proposal.history[0]).toBe(proposal.history[0]);
    const again = approveKbProposal(approved.proposal, {}, now, { eventId: 'kbe-again', itemId: 'kb-again' });
    expect(again.ok).toBe(false);
  });

  it('appends a request for changes and the provider revision', () => {
    const proposal = pending();
    const asked = requestKbChanges(proposal, 'Which tin, and how often?', now, 'kbe-ask');
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    const revised = reviseKbProposal(asked.proposal, {
      title: proposal.title,
      body: 'Backflush after the last shot of the day. Tablets are in the round tin above the machine, not the square one.',
      category: 'kitchen',
      topic: 'Kitchen espresso',
      eventId: 'kbe-rev',
      now,
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.proposal.status).toBe('pending');
    expect(revised.proposal.history.map((event) => event.action)).toEqual(['submitted', 'changes_requested', 'revised']);
    expect(revised.proposal.history[0].body).toBe(proposal.body);
  });
});
