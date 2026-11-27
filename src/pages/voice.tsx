import { Link, useParams } from 'react-router-dom';
import { VoiceFeedbackForm } from '../components/VoiceFeedbackForm';
import { PageHeader } from '../components/ui';
import { providerById } from '../data/load';

export function VoicePage() {
  const { spId } = useParams();
  const provider = spId ? providerById(spId) : undefined;
  return (
    <div className="stack-lg">
      <PageHeader
        kicker="Voice"
        title={provider ? `A note for ${provider.name}` : 'Voice note'}
        lede="Speak it, or drop in a memo from your phone. You’ll see the words before they’re saved as feedback."
        back={provider ? { to: `/providers/${provider.id}`, label: provider.name } : { to: '/knowledge/new', label: 'Add a note' }}
      />
      <VoiceFeedbackForm spId={provider?.id ?? ''} heading={provider ? `Feedback for ${provider.name.split(' ')[0]}` : 'Voice note'} />
      <p className="faint">
        Written notes still live in the <Link to="/knowledge/new">house file</Link>.
      </p>
    </div>
  );
}
