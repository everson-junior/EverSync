"use client";

import Link from "next/link";
import Card from "./Card";
import Button from "./Button";

interface FeatureDisabledNoticeProps {
  featureName?: string;
}

export default function FeatureDisabledNotice({ featureName }: FeatureDisabledNoticeProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full text-center p-8 border border-border/80 bg-surface/60 shadow-xl backdrop-blur-sm">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-6">
          <span className="material-symbols-outlined text-[36px]" aria-hidden="true">
            do_not_disturb_on
          </span>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-text-main mb-2">
          Recurso indisponível na build Basic
        </h2>

        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          {featureName
            ? `A funcionalidade "${featureName}" não está disponível nesta versão.`
            : "Esta funcionalidade foi desativada no perfil Basic (Minimal) do EverSync para redução de bundle size e otimização de recursos."}
        </p>

        <div className="flex justify-center">
          <Link href="/home">
            <Button variant="primary" className="gap-2">
              <span className="material-symbols-outlined text-[18px]">home</span>
              Voltar para o Início
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
