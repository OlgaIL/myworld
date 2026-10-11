import AppHeader from "./AppHeader";
import GuestHome from "./GuestHome";
import PageFooter from "./PageFooter";

// The same public content is rendered at build time and while auth is loading.
// Upload stays disabled until the existing guest/auth flow has loaded.
export default function PublicHomePreview() {
  return (
    <main className="page">
      <AppHeader user={null} authProviders={[]} logoLinkEnabled={false} />
      <GuestHome documents={[]} loading={false} uploadDisabled authProviders={[]} />
      <PageFooter />
    </main>
  );
}
