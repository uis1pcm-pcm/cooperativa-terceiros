import { describe, expect, it } from "vitest";
import { normalizeStatus, toMillis } from "../../src/lib/d1/normalize";
describe("normalização D1",()=>{
  it("considera progresso completo antes do status",()=>expect(normalizeStatus("Aberto",100)).toBe("concluded"));
  it("normaliza labels legados",()=>{expect(normalizeStatus("Pendente",20)).toBe("pending");expect(normalizeStatus("Encerrado",20)).toBe("concluded");});
  it("converte segundos e timestamps Firestore",()=>{expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000);expect(toMillis({toMillis:()=>42})).toBe(42);});
});
