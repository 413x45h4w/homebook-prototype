import { classify } from './classify';
import { detectInstruction } from './instructions';
import { splitPacket } from './packet';
import { dayLegs } from './schedule';
import { GOOGLE_DISTANCE_MATRIX, estimateTravel } from './travel';
import { sameDay } from './time';
import { freshState, clients } from '../data/load';

function ids(items: { id: string }[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

/** Locks the demo story: relevance, the unsaved instruction, and today’s travel conflict. */
export function selfCheck(): string | null {
  const errors: string[] = [];
  const access = classify('apartment_access', 'The door code is 1948 and the dog will bark at the buzzer.');
  if (!access.audience.includes('all')) errors.push('Apartment access should stay with every provider.');

  const laundry = classify('laundry', 'There is dog hair on the towels. Use the unscented detergent, not the dryer sheets.');
  if (!laundry.audience.includes('cleaner') || laundry.audience.includes('dog_walker') || laundry.audience.includes('all')) {
    errors.push(`Laundry was tagged ${laundry.audience.join(', ')}.`);
  }
  if (!/dog walker/i.test(laundry.why)) errors.push('Laundry why-text should mention the dog walker is left out.');

  const pets = classify('pets', 'The leash is on the hook and feeding is one cup of kibble.');
  if (!pets.audience.includes('dog_walker') || !pets.audience.includes('pet_sitter') || pets.audience.includes('cleaner')) {
    errors.push(`Pet note was tagged ${pets.audience.join(', ')}.`);
  }

  const leash = classify('general', 'The leash is on the blue hook by the door.');
  if (!leash.audience.includes('dog_walker') || !leash.audience.includes('pet_sitter')) {
    errors.push('A general leash note should narrow to the dog walker and pet sitter.');
  }

  const shoes = classify('general', 'Shoes come off on the tray inside the door.');
  if (!shoes.audience.includes('all')) errors.push('Shoes should stay with every provider.');

  const saved = detectInstruction('Please always use the harness, not the collar.');
  if (!saved.match) errors.push('Harness message should look like an instruction.');
  const chat = detectInstruction('Can we keep Thursday at 5:15?');
  if (chat.match) errors.push('A scheduling reply should not look like an instruction.');
  const booking = detectInstruction('Could you add a walk two days from now, after 5?', { hasProposal: true });
  if (booking.match) errors.push('A booking proposal should not offer to save as an instruction.');

  if (!GOOGLE_DISTANCE_MATRIX.endpoint.includes('distancematrix')) {
    errors.push('Distance Matrix plug-in endpoint is missing.');
  }

  const alex = clients.find((client) => client.id === 'client-alex');
  const priya = clients.find((client) => client.id === 'client-priya');
  if (!alex || !priya) errors.push('Missing Alex or Priya.');
  else {
    const hop = estimateTravel(alex, priya);
    if (hop.km < 3 || hop.km > 7 || hop.bufferMinutes < 15) {
      errors.push(`Chelsea → Greenpoint looked wrong (${hop.km.toFixed(2)} km, buffer ${hop.bufferMinutes}).`);
    }
  }

  const state = freshState();
  if (state.items.length < 20) errors.push(`Expected about 20 notes, found ${state.items.length}.`);

  const dog = splitPacket(state.items, 'dog_walker');
  const dogIds = ids([...dog.specific, ...dog.universal]);
  for (const id of ['kb-feeding', 'kb-pill', 'kb-miso', 'kb-door', 'kb-quiet']) {
    if (!dogIds.has(id)) errors.push(`Dog-walker packet missing ${id}.`);
  }
  if (dogIds.has('kb-laundry') || dogIds.has('kb-piano') || dogIds.has('kb-vacuum')) {
    errors.push('Dog-walker packet includes a note meant for someone else.');
  }

  const cleaner = splitPacket(state.items, 'cleaner');
  const cleanerIds = ids([...cleaner.specific, ...cleaner.universal]);
  for (const id of ['kb-laundry', 'kb-vacuum', 'kb-kitchen', 'kb-plants', 'kb-door']) {
    if (!cleanerIds.has(id)) errors.push(`Cleaner packet missing ${id}.`);
  }
  if (cleanerIds.has('kb-feeding') || cleanerIds.has('kb-piano')) {
    errors.push('Cleaner packet includes a dog or piano note.');
  }

  const piano = splitPacket(state.items, 'piano_teacher');
  const pianoIds = ids([...piano.specific, ...piano.universal]);
  if (!pianoIds.has('kb-piano') || !pianoIds.has('kb-practice') || !pianoIds.has('kb-wifi')) {
    errors.push('Piano packet is missing the instrument, the practice note, or Wi-Fi.');
  }
  if (pianoIds.has('kb-feeding') || pianoIds.has('kb-laundry')) errors.push('Piano packet is too wide.');

  const plumber = splitPacket(state.items, 'plumber');
  const plumberIds = ids([...plumber.specific, ...plumber.universal]);
  if (plumber.specific.length !== 0) errors.push('Plumber packet should only contain universal notes.');
  for (const id of ['kb-laundry', 'kb-miso', 'kb-piano', 'kb-vacuum']) {
    if (plumberIds.has(id)) errors.push(`Plumber packet should not include ${id}.`);
  }

  const today = new Date();
  const jordanToday = state.visits.filter(
    (visit) => visit.spId === 'sp-jordan' && visit.status !== 'cancelled' && sameDay(visit.start, today),
  );
  const jordanLegs = dayLegs(jordanToday, clients);
  if (!jordanLegs.some((leg) => leg.conflict)) errors.push('Jordan’s day should flag a travel conflict.');
  if (!jordanLegs.some((leg) => !leg.conflict)) errors.push('Jordan’s day should also include a leg that fits.');

  const mariaToday = state.visits.filter(
    (visit) => visit.spId === 'sp-maria' && visit.status !== 'cancelled' && sameDay(visit.start, today),
  );
  if (!dayLegs(mariaToday, clients).some((leg) => leg.conflict)) {
    errors.push('Maria’s day should flag a travel conflict between Brooklyn Heights and the Upper West Side.');
  }

  const unsaved = state.messages.find((message) => message.id === 'msg-jordan-4');
  if (!unsaved || unsaved.savedAsKbItemId || !detectInstruction(unsaved.body).match) {
    errors.push('Jordan’s harness text should still be waiting to save.');
  }

  return errors.length ? errors.join('\n') : null;
}
