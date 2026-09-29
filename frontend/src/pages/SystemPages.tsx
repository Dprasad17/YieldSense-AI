import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { StatusPage } from '../components/ui/States';

export function ForbiddenPage() {
  return (
    <StatusPage
      code="403"
      title="You don't have access to this page"
      message="Your role doesn't include this screen. Ask an administrator if you need access."
    />
  );
}

export function NotFoundPage() {
  return (
    <StatusPage code="404" title="Page not found" message="The page you're looking for doesn't exist or has moved." />
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <StatusPage
      code="500"
      title="Something went wrong"
      message="An unexpected error stopped this page from loading. Reload to try again."
      action={{ label: 'Reload', onClick: () => window.location.reload() }}
    />
  );
}
