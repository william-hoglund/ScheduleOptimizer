import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          {/*
            A real <h1>, not shadcn's CardTitle — that renders a <div>, which
            left every auth page with no heading at all. The utility classes
            keep the card's own scale, since the base h1 style is far larger.
          */}
          <h1 className="font-heading text-base leading-snug font-medium">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      {footer ? <p className="text-muted-foreground mt-5 text-center text-sm">{footer}</p> : null}
    </>
  );
}
