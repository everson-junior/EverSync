const findings = {
  f1: {
    id: "F1",
    status: "DESCARTADO",
    title: "Redirecionamento de credenciais nao confirmado.",
    description:
      "A rota analisada passa pela autorizacao global antes de atualizar um provedor. O caminho sem autenticacao nao existe.",
    tone: "dismissed",
    action: "Nenhuma acao corretiva necessaria",
  },
  f2: {
    id: "F2",
    status: "MEDIO",
    title: "Protecao de dados pode falhar em rotas especificas.",
    description:
      "Com a redacao de PII ativada, algumas rotas enviam o conteudo original ao provedor de IA, mesmo quando dados sensiveis foram detectados.",
    tone: "medium",
    action: "Entender o impacto",
  },
  f3: {
    id: "F3",
    status: "DESCARTADO",
    title: "Limite de leitura e uma decisao de desempenho.",
    description:
      "A verificacao de prompt limitada a 16 KiB e uma escolha explicita de disponibilidade, nao uma barreira de autorizacao burlada.",
    tone: "dismissed",
    action: "Cenario revisado",
  },
};

const detail = document.querySelector("#risk-detail");
const modal = document.querySelector("#risk-modal");

document.querySelectorAll(".risk-node").forEach((node) => {
  node.addEventListener("click", () => {
    const finding = findings[node.dataset.risk];
    detail.innerHTML = `
      <div class="card-top"><span class="risk-tag ${finding.tone}">${finding.status}</span><span class="risk-id">${finding.id}</span></div>
      <h3>${finding.title}</h3>
      <p>${finding.description}</p>
      <button class="text-button" id="open-modal" ${finding.id !== "F2" ? "disabled" : ""}>${finding.action} <span>→</span></button>`;
    document
      .querySelectorAll(".risk-node")
      .forEach((item) => item.classList.toggle("selected", item === node));
    bindModalButton();
  });
});

function bindModalButton() {
  document.querySelector("#open-modal")?.addEventListener("click", () => modal.showModal());
}

bindModalButton();
document.querySelector("#close-modal").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
