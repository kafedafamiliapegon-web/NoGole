"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number | string;
  stock?: number | string | null;
  minimum_stock?: number | string | null;
  active?: boolean | null;
  internal_code?: string | null;
  barcode?: string | null;
  is_favorite?: boolean | null;
  favorite_order?: number | string | null;
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

function situacaoEstoque(product: Product) {
  const stock = Number(product.stock ?? 0);

  if (stock < 0) return "negativo";
  if (stock === 0) return "zerado";

  return "positivo";
}

function textoBusca(valor: string | number | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokensBusca(valor: string) {
  return textoBusca(valor).split(/\s+/).filter(Boolean);
}

function codigoSemZeros(valor: string | null | undefined) {
  const normalizado = textoBusca(valor).replace(/\D/g, "");
  return normalizado.replace(/^0+/, "") || normalizado;
}

function textoEstoque(product: Product) {
  const stock = Number(product.stock ?? 0);
  if (stock < 0) return `Estoque negativo: ${stock} · Conferir físico`;
  if (stock === 0) return "Estoque zerado · Conferir físico";

  return `Estoque: ${stock}`;
}

function precisaConferirEstoque(product: Product) {
  return Number(product.stock ?? 0) <= 0;
}

function pontuarProduto(product: Product, busca: string) {
  const termo = textoBusca(busca);
  if (!termo) return 10;

  const name = textoBusca(product.name);
  const category = textoBusca(product.category);
  const internalCode = textoBusca(product.internal_code);
  const barcode = textoBusca(product.barcode);
  const codeNoZeros = codigoSemZeros(product.internal_code);
  const barcodeNoZeros = codigoSemZeros(product.barcode);
  const termoNumerico = termo.replace(/\D/g, "");
  const buscaApenasNumeros = /^\d+$/.test(termo);
  const termos = tokensBusca(busca);
  const haystack = [name, category, internalCode, barcode, codeNoZeros, barcodeNoZeros]
    .filter(Boolean)
    .join(" ");

  if (buscaApenasNumeros && internalCode && internalCode === termo) return 0;
  if (buscaApenasNumeros && barcode && barcode === termoNumerico) return 1;
  if (buscaApenasNumeros && codeNoZeros === termoNumerico) return 2;
  if (buscaApenasNumeros && internalCode.endsWith(termoNumerico)) return 3;
  if (name.startsWith(termo)) return 4;
  if (termos.length > 0 && termos.every((token) => name.includes(token))) return 5;
  if (termo && name.includes(termo)) return 6;
  if (buscaApenasNumeros && termoNumerico && barcode.includes(termoNumerico)) return 7;
  if (termos.length > 0 && termos.every((token) => haystack.includes(token))) return 8;

  return null;
}

function podeUsarQuantidade(product: Product | null | undefined, qty: number) {
  if (!product) return true;
  const stock = Number(product.stock ?? 0);
  if (stock <= 0) return true;

  return qty <= stock;
}

function acaoLog(action: string) {
  const labels: Record<string, string> = {
    open_comanda: "Comanda aberta",
    add_item: "Produto adicionado",
    increase_item: "Quantidade aumentada",
    decrease_item: "Quantidade diminuída",
    remove_item: "Produto removido",
    close_comanda: "Comanda fechada",
    cancel_comanda: "Comanda cancelada",
    create_product: "Produto cadastrado",
    update_product: "Produto atualizado",
    favorite_product: "Produto favoritado",
    unfavorite_product: "Produto removido dos favoritos",
  };

  return labels[action] || "Ação registrada";
}

function statusComanda(status: string) {
  const labels: Record<string, string> = {
    open: "Aberta",
    closed: "Fechada",
    cancelled: "Cancelada",
  };

  return labels[status] || "Registrada";
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

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const [logoOk, setLogoOk] = useState(true);

  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      {logoOk ? (
        <img
          src="/logo.png"
          alt="NoGole"
          onError={() => setLogoOk(false)}
        />
      ) : (
        <span>NoGole</span>
      )}
    </div>
  );
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
  const [contagemHistorico, setContagemHistorico] = useState<Record<string, number>>(
    {}
  );

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
  const [produtoEmEdicao, setProdutoEmEdicao] = useState<Product | null>(null);
  const [mostrarFormularioProduto, setMostrarFormularioProduto] = useState(false);
  const [buscaGerenciarProduto, setBuscaGerenciarProduto] = useState("");
  const [categoriaGerenciarProduto, setCategoriaGerenciarProduto] = useState("Todos");

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
    const busca = buscaProduto.trim();

    return products
      .map((product) => ({
        product,
        score: pontuarProduto(product, busca),
      }))
      .filter(({ product, score }) => {
        if (score === null) return false;

      const categoriaOk =
        categoriaAtual === "Todos" || product.category === categoriaAtual;

        return categoriaOk;
      })
      .sort((a, b) => {
        if (a.score !== b.score) return Number(a.score) - Number(b.score);

        const estoqueA = Number(a.product.stock ?? 0);
        const estoqueB = Number(b.product.stock ?? 0);
        if (estoqueA > 0 && estoqueB <= 0) return -1;
        if (estoqueB > 0 && estoqueA <= 0) return 1;

        return a.product.name.localeCompare(b.product.name, "pt-BR");
      })
      .map(({ product }) => product);
  }, [products, buscaProduto, categoriaAtual]);

  const produtosFavoritos = useMemo(() => {
    return products
      .filter((product) => product.is_favorite)
      .sort((a, b) => {
        const ordemA = Number(a.favorite_order ?? 999999);
        const ordemB = Number(b.favorite_order ?? 999999);

        if (ordemA !== ordemB) return ordemA - ordemB;

        return a.name.localeCompare(b.name, "pt-BR");
      });
  }, [products]);

  const produtosGerenciados = useMemo(() => {
    return products.filter((product) => {
      const buscaOk = product.name
        .toLowerCase()
        .includes(buscaGerenciarProduto.toLowerCase());
      const categoriaOk =
        categoriaGerenciarProduto === "Todos" ||
        product.category === categoriaGerenciarProduto;

      return buscaOk && categoriaOk;
    });
  }, [products, buscaGerenciarProduto, categoriaGerenciarProduto]);

  const tituloAba = tabs.find((tab) => tab.id === aba)?.label || "Comandas";

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

  async function carregarTudo(silencioso = false) {
    if (!silencioso) setCarregando(true);
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
      if (!silencioso) setCarregando(false);
      return;
    }

    const abertas = (abertasRes.data || []) as Comanda[];
    const historicoCarregado = (historicoRes.data || []) as Comanda[];
    setCommandas(abertas);
    setHistorico(historicoCarregado);
    setProducts((productsRes.data || []) as Product[]);
    setLogs((logsRes.data || []) as SecurityLog[]);

    if (historicoCarregado.length > 0) {
      const ids = historicoCarregado.map((comanda) => comanda.id);
      const { data: itensHistoricoRes } = await supabase
        .from("comanda_items")
        .select("comanda_id")
        .in("comanda_id", ids);

      const contagem = (itensHistoricoRes || []).reduce<Record<string, number>>(
        (acc, item) => {
          const id = item.comanda_id as string;
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        },
        {}
      );

      setContagemHistorico(contagem);
    } else {
      setContagemHistorico({});
    }

    if (comandaAtual) {
      const atualizada = abertas.find((item) => item.id === comandaAtual.id);
      setComandaAtual(atualizada || null);
      if (!atualizada) setItens([]);
    }

    if (!silencioso) setCarregando(false);
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

    const { data: existenteNoBanco, error: existenteError } = await supabase
      .from("commandas")
      .select("*")
      .eq("status", "open")
      .ilike("name", nome)
      .limit(1)
      .maybeSingle();

    if (existenteError) {
      setErro(existenteError.message);
      return;
    }

    if (existenteNoBanco) {
      setComandaAtual(existenteNoBanco as Comanda);
      setNomeComanda("");
      await carregarItens(existenteNoBanco.id, "atual");
      await carregarTudo(true);
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
      if (!podeUsarQuantidade(produto, itemAtual.qty + 1)) {
        alert(`Estoque insuficiente para ${produto.name}.`);
        return;
      }

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

  async function alternarFavorito(produto: Product) {
    const favoritar = !produto.is_favorite;
    const maiorOrdemFavorita = products.reduce((maior, item) => {
      if (!item.is_favorite) return maior;

      return Math.max(maior, Number(item.favorite_order ?? 0));
    }, 0);

    const { error } = await supabase
      .from("products")
      .update({
        is_favorite: favoritar,
        favorite_order: favoritar ? maiorOrdemFavorita + 1 : null,
        updated_by_name: operador,
      })
      .eq("id", produto.id);

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      favoritar ? "favorite_product" : "unfavorite_product",
      favoritar
        ? `${operador} marcou ${produto.name} como favorito`
        : `${operador} removeu ${produto.name} dos favoritos`,
      "products",
      produto.id,
      {
        product_id: produto.id,
        product_name: produto.name,
        is_favorite: favoritar,
      }
    );

    await carregarTudo(true);
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

    if (!podeUsarQuantidade(item.products, qty)) {
      alert(`Estoque insuficiente para ${item.products?.name || "produto"}.`);
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

  function limparFormularioProduto() {
    setProdutoNome("");
    setProdutoCategoria("Diversos");
    setProdutoPreco("");
    setProdutoEstoque("");
    setProdutoMinimo("");
    setProdutoEmEdicao(null);
  }

  function abrirCadastroProduto() {
    limparFormularioProduto();
    setMostrarFormularioProduto(true);
  }

  function editarProduto(product: Product) {
    setProdutoEmEdicao(product);
    setProdutoNome(product.name);
    setProdutoCategoria(product.category || "Diversos");
    setProdutoPreco(String(product.price ?? "").replace(".", ","));
    setProdutoEstoque(String(product.stock ?? 0));
    setProdutoMinimo(String(product.minimum_stock ?? 0));
    setMostrarFormularioProduto(true);
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

    const preco = numero(produtoPreco);

    if (!Number.isFinite(preco) || preco <= 0) {
      alert("Digite um preço válido.");
      return;
    }

    const payload = {
      name: nome,
      category: produtoCategoria,
      price: preco,
      stock: Number(produtoEstoque || 0),
      minimum_stock: Number(produtoMinimo || 0),
      active: true,
      updated_by_name: operador,
    };

    const { error } = produtoEmEdicao
      ? await supabase.from("products").update(payload).eq("id", produtoEmEdicao.id)
      : await supabase.from("products").insert({
          ...payload,
          created_by_name: operador,
        });

    if (error) {
      setErro(error.message);
      return;
    }

    await registrarLog(
      produtoEmEdicao ? "update_product" : "create_product",
      produtoEmEdicao
        ? `${operador} reajustou o produto ${nome}`
        : `${operador} cadastrou o produto ${nome}`,
      "products",
      produtoEmEdicao?.id,
      {
        price: preco,
        stock: Number(produtoEstoque || 0),
        minimum_stock: Number(produtoMinimo || 0),
      }
    );

    limparFormularioProduto();
    setMostrarFormularioProduto(false);
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
        () => carregarTudo(true)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comanda_items" },
        () => {
          carregarTudo(true);
          if (comandaAtual?.id) carregarItens(comandaAtual.id, "atual");
          if (historicoAtual?.id) carregarItens(historicoAtual.id, "historico");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => carregarTudo(true)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "security_logs" },
        () => carregarTudo(true)
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
          <BrandLogo />
          <p className="login-kicker">NoGole</p>
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
        <div className="topbar-brand">
          <BrandLogo compact />
          <div>
            <span className="brand-chip">NoGole</span>
            <h1>{tituloAba}</h1>
          </div>
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
                  <div className="product-search">
                    <input
                      value={buscaProduto}
                      onChange={(event) => setBuscaProduto(event.target.value)}
                      placeholder="Buscar produto, código ou código de barras..."
                      inputMode="search"
                    />
                    {buscaProduto && (
                      <button
                        className="clear-search-button"
                        onClick={() => setBuscaProduto("")}
                        aria-label="Limpar busca de produtos"
                        title="Limpar busca"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {produtosFavoritos.length > 0 && (
                  <section className="favorites-panel">
                    <div className="favorites-head">
                      <h4>Favoritos</h4>
                      <span>{produtosFavoritos.length}</span>
                    </div>
                    <div className="favorites-strip">
                      {produtosFavoritos.map((product) => {
                        const estoqueStatus = situacaoEstoque(product);

                        return (
                          <button
                            key={product.id}
                            className={`favorite-product stock-${estoqueStatus}`}
                            onClick={() => adicionarProduto(product)}
                          >
                            <strong>{product.name}</strong>
                            <small>{dinheiro(product.price)}</small>
                            {precisaConferirEstoque(product) && (
                              <small>{textoEstoque(product)}</small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

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
                    <div className="empty-state">
                      <strong>Nenhum produto encontrado</strong>
                      <small>Confira o nome, código ou código de barras.</small>
                    </div>
                  )}

                  {produtosFiltrados.map((product) => {
                    const estoqueStatus = situacaoEstoque(product);

                    return (
                      <article
                        key={product.id}
                        className={`product-card stock-${estoqueStatus}`}
                      >
                        <button
                          className={
                            product.is_favorite
                              ? "favorite-button active"
                              : "favorite-button"
                          }
                          onClick={() => alternarFavorito(product)}
                          aria-label={
                            product.is_favorite
                              ? `Remover ${product.name} dos favoritos`
                              : `Marcar ${product.name} como favorito`
                          }
                          title={
                            product.is_favorite
                              ? "Remover dos favoritos"
                              : "Marcar como favorito"
                          }
                        >
                          {product.is_favorite ? "★" : "☆"}
                        </button>
                        <button
                          className="product-add-area"
                          onClick={() => adicionarProduto(product)}
                        >
                        <span className="product-card-info">
                          <strong>{product.name}</strong>
                          <small>
                            {dinheiro(product.price)} · {textoEstoque(product)}
                            {product.internal_code
                              ? ` · Código: ${product.internal_code}`
                              : ""}
                          </small>
                          {product.barcode && <small>Barras: {product.barcode}</small>}
                        </span>
                        <b>{dinheiro(product.price)}</b>
                        <i>+</i>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            </section>
          )}
        </section>
      )}

      {aba === "produtos" && (
        <section className="view-stack">
          <section className="manage-products-card">
            <div>
              <h2>Produtos cadastrados</h2>
              <p>Busque, confira estoque e reajuste preços rapidamente.</p>
            </div>
            <button onClick={abrirCadastroProduto}>Cadastrar produto</button>
          </section>

          <section className="product-tools">
            <input
              value={buscaGerenciarProduto}
              onChange={(event) => setBuscaGerenciarProduto(event.target.value)}
              placeholder="Buscar produto"
            />
            <select
              value={categoriaGerenciarProduto}
              onChange={(event) => setCategoriaGerenciarProduto(event.target.value)}
            >
              <option>Todos</option>
              {categorias.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
          </section>

          {mostrarFormularioProduto && (
            <section className="form-card product-editor">
              <div className="form-title-row">
                <h2>
                  {produtoEmEdicao ? "Reajustar produto" : "Cadastrar produto"}
                </h2>
                <button
                  className="soft-button"
                  onClick={() => {
                    limparFormularioProduto();
                    setMostrarFormularioProduto(false);
                  }}
                >
                  Fechar
                </button>
              </div>
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
              <button onClick={salvarProduto}>
                {produtoEmEdicao ? "Salvar reajuste" : "Salvar produto"}
              </button>
            </section>
          )}

          <section className="product-list">
            {produtosGerenciados.length === 0 && (
              <div className="empty-state">Nenhum produto encontrado.</div>
            )}

            {produtosGerenciados.map((product) => (
              <article key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {product.category || "Diversos"} - Estoque: {product.stock ?? 0}
                  </small>
                  <small>
                    Estoque mínimo: {product.minimum_stock ?? 0}
                  </small>
                </div>
                <b>{dinheiro(product.price)}</b>
                <button onClick={() => editarProduto(product)}>Editar</button>
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
                    {statusComanda(comanda.status)} - {contagemHistorico[comanda.id] || 0} itens
                  </small>
                  <small>
                    Abriu: {dataHora(comanda.opened_at)} -{" "}
                    {comanda.opened_by_name || "sem nome"}
                  </small>
                  <small>
                    Fechou/cancelou: {dataHora(comanda.closed_at)} -{" "}
                    {comanda.closed_by_name || "sem nome"}
                  </small>
                </span>
                <b>{dinheiro(comanda.total)}</b>
              </button>
            ))}
          </section>

          {historicoAtual && (
            <section className="history-detail">
              <div className="history-detail-head">
                <div>
                  <h2>{historicoAtual.name}</h2>
                  <p>{statusComanda(historicoAtual.status)}</p>
                </div>
                <button onClick={() => setHistoricoAtual(null)}>
                  Fechar detalhes
                </button>
              </div>
              <div className="history-facts">
                <span>Abriu: {historicoAtual.opened_by_name || "sem nome"}</span>
                <span>Fechou/cancelou: {historicoAtual.closed_by_name || "sem nome"}</span>
                <span>Entrada: {dataHora(historicoAtual.opened_at)}</span>
                <span>Saída: {dataHora(historicoAtual.closed_at)}</span>
              </div>
              {itensHistorico.map((item) => (
                <div className="history-item" key={item.id}>
                  <span className="history-item-name">
                    <strong>{item.products?.name || "Produto"}</strong>
                    <small>
                      {item.qty} x {dinheiro(item.price)}
                    </small>
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
              <span className="log-action">{acaoLog(log.action)}</span>
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
