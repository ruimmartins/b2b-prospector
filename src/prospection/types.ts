export interface ProspectionResult {
  place_id: string;
  nome_empresa: string;
  website_url: string | null;
  email: string | null;
  telefone: string | null;
  morada: string | null;
  domain: string | null;
}

export interface ProspectionProvider {
  search(nicho: string, cidade: string, limite: number): Promise<ProspectionResult[]>;
}
