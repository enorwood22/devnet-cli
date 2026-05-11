import Conf from "conf";

interface ConfigSchema {
  authToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  serverUrl: string;
  adminSecret: string;
}

const config = new Conf<ConfigSchema>({
  projectName: "devnet",
  defaults: {
    authToken: "",
    refreshToken: "",
    userId: "",
    email: "",
    serverUrl: "wss://relay.devnet.sh",
    adminSecret: "",
  },
});

export default config;
