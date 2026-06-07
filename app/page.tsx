"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
  category: string | null;
  description?: string | null;
  image_url?: string | null;
  price: number | string;
  stock?: number | string | null;
  minimum_stock?: number | string | null;
  active?: boolean | null;
};

type Comanda = {
  id: string;
  name: string;
  status: "open" | "closed" | "cancelled" | string;
  total?: number | string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  opened_by_name?: string | null;
  closed_by_name?: string | null;
};

type ComandaItem = {
  id: string;
  comanda_id: string;
  product_id: string;
  qty: number;
  price: number | string;
  products?: Product | null;
};

type SecurityLog = {
  id: string;
  operator_name?: string | null;
  action: string;
  description: string;
  created_at: string;
};

const categorias = [
  "Bebidas",
  "Cervejas",
  "Refrigerantes",
  "Energéticos",
  "Sucos",
  "Água",
  "Salgadinhos",
  "Doces",
  "Diversos",
];

const tabs = [
  { id: "comandas", label: "Comandas" },
  { id: "produtos", label: "Produtos" },
  { id: "historico", label: "Histórico" },
  { id: "logs", label: "Logs" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function dinheiro(valor: number | string | null | undefined) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function numero(valor: string) {
  return Number(valor.replace(",", "."));
}

function dataHora(data?: string | null) {
  if (!data) return "Sem data";

  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function gerarNomeSeguroArquivo(file: File) {
  const extensao = file.name.split(".").pop()?.toLowerCase() || "png";
  const nomeBase = file.name
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `produto-${Date.now()}-${nomeBase || "imagem"}.${extensao}`;
}

export default function Home() {
  const [operador, setOperador] = useState("");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [aba, setAba] = useState<TabId>("comandas");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [commandas, setCommandas] = useState<Comanda[]>([]);
  const [historico, setHistorico] = useState<Comanda[]>([]);
  const [comandaAtual, setComandaAtual] = useState<Comanda | null>(null);
  const [historicoAtual, setHistoricoAtual] = useState<Comanda | null>(null);
  const [itens, setItens] = useState<ComandaItem[]>([]);
  const [itensHistorico, setItensHistorico] = useState<ComandaItem[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);

  const [nomeComanda, setNomeComanda] = useState("");
  const [buscaComanda, setBuscaComanda] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [categoriaAtual, setCategoriaAtual] = useState("Todos");

  const [produtoNome, setProdutoNome] = useState("");
  const [produtoCategoria, setProdutoCategoria] = useState("Diversos");
  const [produtoPreco, setProdutoPreco] = useState("");
  const [produtoEstoque, setProdutoEstoque] = useState("");
  const [produtoMinimo, setProdutoMinimo] = useState("");
  const [produtoDescricao, setProdutoDescricao] = useState("");
  const [produtoArquivo, setProdutoArquivo] = useState<File | null>(null);

  const totalItens = useMemo(
    () => itens.reduce((acc, item) => acc + item.qty * Number(item.price || 0), 0),
    [itens]
  );

  const totalHistorico = useMemo(
    () =>
      itensHistorico.reduce(
        (acc, item) => acc + item.qty * Number(item.price || 0),
        0
      ),
    [itensHistorico]
  );

  const commandasFiltradas = useMemo(() => {
    return commandas.filter((comanda) =>
      comanda.name.toLowerCase().includes(buscaComanda.toLowerCase())
    );
  }, [commandas, buscaComanda]);

  const produtosFiltrados = useMemo(() => {
    return products.filter((product) => {
      const buscaOk = product.name
        .toLowerCase()
        .includes(buscaProduto.toLowerCase());
      const categoriaOk =
        categoriaAtual === "Todos" || product.category === categoriaAtual;

      return buscaOk && categoriaOk;
    });
  }, [products, buscaProduto, categoriaAtual]);

  async function registrarLog(
    action: string,
    description: string,
    entity?: string,
    entityId?: string,
    metadata?: Record<string, unknown>
  ) {
    await supabase.from("security_logs").insert({
      operator_name: operador || "Sem nome",
      action,
      entity: entity || null,
      entity_id: entityId || null,
      description,
      metadata: metadata || null,
    });
  }

  async function carregarTudo() {
    setCarregando(true);
    setErro("");

    const [abertasRes, historicoRes, productsRes, logsRes] = await Promise.all([
      supabase
        .from("commandas")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false }),
      supabase
        .from("commandas")
        .select("*")
        .in("status", ["closed", "cancelled"])
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(80),
      supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("security_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    const error =
      abertasRes.error || historicoRes.error || productsRes.error || logsRes.error;

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    const abertas = (abertasRes.data || []) as Comanda[];
    setCommandas(abertas);
    setHistorico((historicoRes.data || []) as Comanda[]);
    setProducts((productsRes.data || []) as Product[]);
    setLogs((logsRes.data || []) as SecurityLog[]);

    if (comandaAtual) {
      const atualizada = abertas.find((item) => item.id === comandaAtual.id);
      setComandaAtual(atualizada || null);
      if (!atualizada) setItens([]);
    }

    setCarregando(false);
  }

  async function carregarItens(comandaId: string, destino: "atual" | "historico") {
    const { data, error } = await supabase
      .from("comanda_items")
      .select("*, products(*)")
      .eq("comanda_id", comandaId)
      .order("created_at", { ascending: true });

    if (error) {
      setErro(error.message);
      return;
    }

    if (destino === "historico") {
      setItensHistorico((data || []) as ComandaItem[]);
      return;
    }

    setItens((data || []) as ComandaItem[]);
  }

  async function criarComanda() {
    const nome = nomeComanda.trim();

    if (!nome) {
      alert("Digite o nome da comanda.");
      return;
    }

    const existente = commandas.find(
      (comanda) => comanda.name.toLowerCase() === nome.toLowerCase()
    );

    if (existente) {
      setComandaAtual(existente);
      setNomeComanda("");
      await carregarItens(existente.id, "atual");
      return;
    }

    const { data, error } = await supabase
      .from("commandas")
      .insert({
        name: nome,
        status: "open",
        opened_by_name: operador,
      })
      .select()
      .single();

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      "open_comanda",
      `${operador} abriu a comanda ${nome}`,
      "commandas",
      data.id
    );

    setNomeComanda("");
    setComandaAtual(data as Comanda);
    setItens([]);
    await carregarTudo();
  }

  async function adicionarProduto(produto: Product) {
    if (!comandaAtual) {
      alert("Selecione ou crie uma comanda primeiro.");
      return;
    }

    const itemAtual = itens.find((item) => item.product_id === produto.id);

    if (itemAtual) {
      await atualizarQuantidade(
        itemAtual,
        itemAtual.qty + 1,
        "increase_item",
        `${operador} aumentou ${produto.name} na comanda ${comandaAtual.name}`
      );
      return;
    }

    const { error } = await supabase.from("comanda_items").insert({
      comanda_id: comandaAtual.id,
      product_id: produto.id,
      qty: 1,
      price: Number(produto.price || 0),
      created_by_name: operador,
      updated_by_name: operador,
    });

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      "add_item",
      `${operador} adicionou 1x ${produto.name} na comanda ${comandaAtual.name}`,
      "commandas",
      comandaAtual.id,
      { product_id: produto.id, product_name: produto.name }
    );

    await carregarItens(comandaAtual.id, "atual");
    await carregarTudo();
  }

  async function atualizarQuantidade(
    item: ComandaItem,
    qty: number,
    action: string,
    description: string
  ) {
    if (!comandaAtual) return;

    if (qty <= 0) {
      await removerItem(item, false);
      return;
    }

    const { error } = await supabase
      .from("comanda_items")
      .update({
        qty,
        updated_by_name: operador,
      })
      .eq("id", item.id);

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(action, description, "commandas", comandaAtual.id, {
      item_id: item.id,
      product_id: item.product_id,
      qty,
    });

    await carregarItens(comandaAtual.id, "atual");
    await carregarTudo();
  }

  async function diminuirItem(item: ComandaItem) {
    await atualizarQuantidade(
      item,
      item.qty - 1,
      "decrease_item",
      `${operador} diminuiu ${item.products?.name || "produto"} na comanda ${
        comandaAtual?.name || ""
      }`
    );
  }

  async function removerItem(item: ComandaItem, confirmar = true) {
    if (!comandaAtual) return;

    if (confirmar) {
      const ok = confirm(`Remover ${item.products?.name || "produto"}?`);
      if (!ok) return;
    }

    const { error } = await supabase.from("comanda_items").delete().eq("id", item.id);

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      "remove_item",
      `${operador} removeu ${item.products?.name || "produto"} da comanda ${
        comandaAtual.name
      }`,
      "commandas",
      comandaAtual.id,
      { item_id: item.id, product_id: item.product_id }
    );

    await carregarItens(comandaAtual.id, "atual");
    await carregarTudo();
  }

  async function fecharComanda() {
    if (!comandaAtual) return;

    const ok = confirm(`Fechar a comanda ${comandaAtual.name} sem pagamento?`);
    if (!ok) return;

    const total = totalItens;
    const { error } = await supabase
      .from("commandas")
      .update({
        status: "closed",
        total,
        closed_by_name: operador,
        closed_at: new Date().toISOString(),
      })
      .eq("id", comandaAtual.id);

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      "close_comanda",
      `${operador} fechou a comanda ${comandaAtual.name} com total ${dinheiro(total)}`,
      "commandas",
      comandaAtual.id
    );

    setComandaAtual(null);
    setItens([]);
    await carregarTudo();
  }

  async function cancelarComanda() {
    if (!comandaAtual) return;

    const palavra = prompt(
      `Para cancelar a comanda ${comandaAtual.name}, digite CANCELAR`
    );

    if (palavra !== "CANCELAR") {
      alert("Cancelamento interrompido.");
      return;
    }

    const { error } = await supabase
      .from("commandas")
      .update({
        status: "cancelled",
        closed_by_name: operador,
        closed_at: new Date().toISOString(),
      })
      .eq("id", comandaAtual.id);

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      "cancel_comanda",
      `${operador} cancelou a comanda ${comandaAtual.name}`,
      "commandas",
      comandaAtual.id
    );

    setComandaAtual(null);
    setItens([]);
    await carregarTudo();
  }

  async function salvarProduto() {
    const nome = produtoNome.trim();

    if (!nome) {
      alert("Digite o nome do produto.");
      return;
    }

    if (!produtoPreco.trim()) {
      alert("Digite o preço do produto.");
      return;
    }

    let imageUrl: string | null = null;

    if (produtoArquivo) {
      const tiposPermitidos = ["image/png", "image/jpeg", "image/webp"];

      if (!tiposPermitidos.includes(produtoArquivo.type)) {
        alert("Imagem inválida. Use PNG, JPG/JPEG ou WEBP.");
        return;
      }

      if (produtoArquivo.size > 5 * 1024 * 1024) {
        alert("Imagem muito grande. Use até 5MB.");
        return;
      }

      const nomeArquivo = gerarNomeSeguroArquivo(produtoArquivo);
      const { error: uploadError } = await supabase.storage
        .from("products")
        .upload(nomeArquivo, produtoArquivo);

      if (uploadError) {
        setErro(uploadError.message);
        return;
      }

      imageUrl = supabase.storage.from("products").getPublicUrl(nomeArquivo).data
        .publicUrl;
    }

    const { error } = await supabase.from("products").insert({
      name: nome,
      category: produtoCategoria,
      description: produtoDescricao.trim() || null,
      price: numero(produtoPreco),
      stock: Number(produtoEstoque || 0),
      minimum_stock: Number(produtoMinimo || 0),
      image_url: imageUrl,
      active: true,
      created_by_name: operador,
      updated_by_name: operador,
    });

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog("create_product", `${operador} cadastrou o produto ${nome}`);

    setProdutoNome("");
    setProdutoCategoria("Diversos");
    setProdutoPreco("");
    setProdutoEstoque("");
    setProdutoMinimo("");
    setProdutoDescricao("");
    setProdutoArquivo(null);
    await carregarTudo();
  }

  function entrar() {
    const nome = nomeDigitado.trim();

    if (!nome) {
      alert("Digite seu nome.");
      return;
    }

    localStorage.setItem("nogole_operator_name", nome);
    setOperador(nome);
  }

  function trocarOperador() {
    const ok = confirm("Trocar operador?");
    if (!ok) return;

    localStorage.removeItem("nogole_operator_name");
    setOperador("");
    setNomeDigitado("");
    setComandaAtual(null);
    setHistoricoAtual(null);
    setItens([]);
    setItensHistorico([]);
  }

  useEffect(() => {
    const salvo = localStorage.getItem("nogole_operator_name");
    if (salvo) setOperador(salvo);
  }, []);

  useEffect(() => {
    if (!operador) return;

    carregarTudo();

    const channel = supabase
      .channel("nogole-comandas-mobile")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandas" },
        () => carregarTudo()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comanda_items" },
        () => {
          carregarTudo();
          if (comandaAtual?.id) carregarItens(comandaAtual.id, "atual");
          if (historicoAtual?.id) carregarItens(historicoAtual.id, "historico");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => carregarTudo()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "security_logs" },
        () => carregarTudo()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [operador, comandaAtual?.id, historicoAtual?.id]);

  if (!operador) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <div className="brand-mark">NG</div>
          <p className="login-kicker">NoGole Comandas</p>
          <h1>Quem está usando?</h1>
          <div className="login-form">
            <input
              value={nomeDigitado}
              onChange={(event) => setNomeDigitado(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") entrar();
              }}
              placeholder="Paula, Samuel, Tia..."
              autoFocus
            />
            <button onClick={entrar}>Entrar</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-chip">NoGole</span>
          <h1>Comandas</h1>
        </div>
        <button className="operator-button" onClick={trocarOperador}>
          {operador}
        </button>
      </header>

      {erro && (
        <button className="error-banner" onClick={() => setErro("")}>
          {erro}
        </button>
      )}

      {aba === "comandas" && (
        <section className="view-stack">
          {!comandaAtual && (
            <>
              <section className="action-card">
                <div>
                  <p>Total abertas</p>
                  <strong>{commandas.length}</strong>
                </div>
                <div className="new-comanda">
                  <input
                    value={nomeComanda}
                    onChange={(event) => setNomeComanda(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") criarComanda();
                    }}
                    placeholder="Nome: João, Mesa 1..."
                  />
                  <button onClick={criarComanda}>Nova comanda</button>
                </div>
              </section>

              <input
                className="search-input"
                value={buscaComanda}
                onChange={(event) => setBuscaComanda(event.target.value)}
                placeholder="Buscar comanda aberta"
              />

              <section className="comanda-list">
                {commandasFiltradas.length === 0 && (
                  <div className="empty-state">Nenhuma comanda aberta.</div>
                )}

                {commandasFiltradas.map((comanda) => (
                  <button
                    key={comanda.id}
                    className="comanda-row"
                    onClick={async () => {
                      setComandaAtual(comanda);
                      await carregarItens(comanda.id, "atual");
                    }}
                  >
                    <span>
                      <strong>{comanda.name}</strong>
                      <small>
                        Aberta {dataHora(comanda.opened_at)} por{" "}
                        {comanda.opened_by_name || "sem nome"}
                      </small>
                    </span>
                    <b>{dinheiro(comanda.total)}</b>
                  </button>
                ))}
              </section>
            </>
          )}

          {comandaAtual && (
            <section className="detail-screen">
              <div className="detail-top">
                <button className="back-button" onClick={() => setComandaAtual(null)}>
                  Voltar
                </button>
                <div>
                  <h2>{comandaAtual.name}</h2>
                  <p>{itens.length} itens na comanda</p>
                </div>
                <strong>{dinheiro(comandaAtual.total ?? totalItens)}</strong>
              </div>

              <section className="items-panel">
                {itens.length === 0 && (
                  <div className="empty-state dark">Comanda vazia.</div>
                )}

                {itens.map((item) => (
                  <div className="item-row" key={item.id}>
                    <div>
                      <strong>{item.products?.name || "Produto"}</strong>
                      <small>
                        {item.qty} x {dinheiro(item.price)}
                      </small>
                    </div>
                    <b>{dinheiro(item.qty * Number(item.price || 0))}</b>
                    <div className="qty-actions">
                      <button onClick={() => diminuirItem(item)}>-</button>
                      <span>{item.qty}</span>
                      <button
                        onClick={() =>
                          atualizarQuantidade(
                            item,
                            item.qty + 1,
                            "increase_item",
                            `${operador} aumentou ${
                              item.products?.name || "produto"
                            } na comanda ${comandaAtual.name}`
                          )
                        }
                      >
                        +
                      </button>
                      <button className="remove" onClick={() => removerItem(item)}>
                        Remover
                      </button>
                    </div>
                  </div>
                ))}

                <div className="total-line">
                  <span>Total atual</span>
                  <strong>{dinheiro(comandaAtual.total ?? totalItens)}</strong>
                </div>
                <button className="close-button" onClick={fecharComanda}>
                  Fechar comanda
                </button>
                <button className="cancel-button" onClick={cancelarComanda}>
                  Cancelar comanda
                </button>
              </section>

              <section className="products-panel">
                <div className="panel-title">
                  <h3>Adicionar produtos</h3>
                  <input
                    value={buscaProduto}
                    onChange={(event) => setBuscaProduto(event.target.value)}
                    placeholder="Buscar produto"
                  />
                </div>

                <div className="category-strip">
                  {["Todos", ...categorias].map((categoria) => (
                    <button
                      key={categoria}
                      className={categoriaAtual === categoria ? "active" : ""}
                      onClick={() => setCategoriaAtual(categoria)}
                    >
                      {categoria}
                    </button>
                  ))}
                </div>

                <div className="product-grid">
                  {produtosFiltrados.length === 0 && (
                    <div className="empty-state">Nenhum produto encontrado.</div>
                  )}

                  {produtosFiltrados.map((product) => (
                    <button
                      key={product.id}
                      className="product-card"
                      onClick={() => adicionarProduto(product)}
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <span className="image-placeholder">Sem imagem</span>
                      )}
                      <strong>{product.name}</strong>
                      <small>{product.category || "Diversos"}</small>
                      <b>{dinheiro(product.price)}</b>
                    </button>
                  ))}
                </div>
              </section>
            </section>
          )}
        </section>
      )}

      {aba === "produtos" && (
        <section className="view-stack">
          <section className="form-card">
              <h2>Cadastrar produto</h2>
            <input
              value={produtoNome}
              onChange={(event) => setProdutoNome(event.target.value)}
              placeholder="Nome"
            />
            <select
              value={produtoCategoria}
              onChange={(event) => setProdutoCategoria(event.target.value)}
            >
              {categorias.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
            <input
              value={produtoPreco}
              onChange={(event) => setProdutoPreco(event.target.value)}
              placeholder="Preço. Ex: 8,00"
            />
            <input
              value={produtoEstoque}
              onChange={(event) => setProdutoEstoque(event.target.value)}
              placeholder="Estoque"
            />
            <input
              value={produtoMinimo}
              onChange={(event) => setProdutoMinimo(event.target.value)}
              placeholder="Estoque mínimo"
            />
            <textarea
              value={produtoDescricao}
              onChange={(event) => setProdutoDescricao(event.target.value)}
              placeholder="Descrição"
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setProdutoArquivo(event.target.files?.[0] || null)}
            />
            <button onClick={salvarProduto}>Salvar produto</button>
          </section>

          <section className="product-list">
            {products.map((product) => (
              <article key={product.id}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} />
                ) : (
                  <span />
                )}
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {product.category || "Diversos"} - Estoque:{" "}
                    {product.stock ?? 0}
                  </small>
                </div>
                <b>{dinheiro(product.price)}</b>
              </article>
            ))}
          </section>
        </section>
      )}

      {aba === "historico" && (
        <section className="view-stack">
          <section className="history-list">
            {historico.length === 0 && (
              <div className="empty-state">Nenhuma comanda no histórico.</div>
            )}

            {historico.map((comanda) => (
              <button
                key={comanda.id}
                className="history-row"
                onClick={async () => {
                  setHistoricoAtual(comanda);
                  await carregarItens(comanda.id, "historico");
                }}
              >
                <span>
                  <strong>{comanda.name}</strong>
                  <small>
                    {comanda.status === "closed" ? "Fechada" : "Cancelada"} - abriu{" "}
                    {dataHora(comanda.opened_at)} - fechou {dataHora(comanda.closed_at)}
                  </small>
                  <small>
                    Por {comanda.opened_by_name || "sem nome"} /{" "}
                    {comanda.closed_by_name || "sem nome"}
                  </small>
                </span>
                <b>{dinheiro(comanda.total)}</b>
              </button>
            ))}
          </section>

          {historicoAtual && (
            <section className="history-detail">
              <div>
                <h2>{historicoAtual.name}</h2>
                <p>{historicoAtual.status === "closed" ? "Fechada" : "Cancelada"}</p>
              </div>
              {itensHistorico.map((item) => (
                <div className="history-item" key={item.id}>
                  <span>
                    {item.qty}x {item.products?.name || "Produto"}
                  </span>
                  <b>{dinheiro(item.qty * Number(item.price || 0))}</b>
                </div>
              ))}
              <div className="total-line light">
                <span>Total</span>
                <strong>{dinheiro(historicoAtual.total ?? totalHistorico)}</strong>
              </div>
            </section>
          )}
        </section>
      )}

      {aba === "logs" && (
        <section className="logs-list">
          {logs.length === 0 && <div className="empty-state">Nenhum log ainda.</div>}

          {logs.map((log) => (
            <article key={log.id}>
              <strong>{log.description}</strong>
              <small>
                {log.operator_name || "Sem operador"} - {dataHora(log.created_at)}
              </small>
            </article>
          ))}
        </section>
      )}

      {carregando && <div className="loading-pill">Sincronizando...</div>}

      <nav className="bottom-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={aba === tab.id ? "active" : ""}
            onClick={() => setAba(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
