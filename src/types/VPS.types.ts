export interface VPSConnect {
  host: string;
  port: number;
  user: string;
  password?: string;
  privateKey?: any;
}

export interface DatabaseInitScript {
  index: number;
  filename: string;
  content: string;
}
