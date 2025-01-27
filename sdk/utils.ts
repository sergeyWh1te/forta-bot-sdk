import os from "os";
import fs from "fs";
import { join } from "path";
import { jsonc } from "jsonc";
import _ from "lodash";
import { Keccak } from "sha3";
import { Network } from "./network";
import { EventType } from "./event.type";
import { FortaConfig } from "./forta.config";
import { Alert } from "./alert";
import { AlertEvent } from "./alert.event";
import { BlockEvent } from "./block.event";
import { Trace } from "./trace";
import { TransactionEvent } from "./transaction.event";
import { Transaction } from "./transaction";
import { Log, Receipt } from "./receipt";
import { TxEventBlock } from "./transaction.event";
import { Block } from "./block";
import { ethers } from "ethers";

let chainId: number | undefined;
export const getChainId = async (): Promise<number> => {
  // if chain id provided by scanner i.e. in production
  if (process.env.FORTA_CHAIN_ID) {
    return parseInt(process.env.FORTA_CHAIN_ID);
  }

  // query from the ethers provider i.e. for developing locally
  const provider = getEthersProvider();
  if (!chainId) {
    chainId = (await provider.getNetwork()).chainId;
  }
  return chainId;
};

export const getEthersProvider = () => {
  return new ethers.providers.JsonRpcProvider(getJsonRpcUrl());
};

export const getEthersBatchProvider = () => {
  return new ethers.providers.JsonRpcBatchProvider(getJsonRpcUrl());
};

export const getBotOwner = () => {
  // if bot owner provided by scanner i.e. in production
  if (process.env.FORTA_BOT_OWNER) {
    return process.env.FORTA_BOT_OWNER;
  }

  // return a mock value for local development
  return "0xMockOwner";
};

export const getBotId = () => {
  // if bot id provided by scanner i.e. in production
  if (process.env.FORTA_BOT_ID) {
    return process.env.FORTA_BOT_ID;
  }

  // return a mock value for local development
  return "0xMockBotId";
};

let fortaConfig: FortaConfig | undefined = undefined;
export const getFortaConfig: () => FortaConfig = () => {
  if (fortaConfig) return fortaConfig;

  fortaConfig = {};
  // try to read from global config
  const globalConfigPath = join(os.homedir(), ".forta", "forta.config.json");
  if (fs.existsSync(globalConfigPath)) {
    fortaConfig = Object.assign(
      fortaConfig!,
      jsonc.parse(fs.readFileSync(globalConfigPath, "utf8"))
    );
  }
  // try to read from local project config
  const configFlagIndex = process.argv.indexOf("--config");
  const configFile =
    configFlagIndex == -1 ? undefined : process.argv[configFlagIndex + 1];
  const localConfigPath = join(
    process.cwd(),
    configFile || "forta.config.json"
  );
  if (fs.existsSync(localConfigPath)) {
    fortaConfig = Object.assign(
      fortaConfig!,
      jsonc.parse(fs.readFileSync(localConfigPath, "utf8"))
    );
  }
  return fortaConfig!;
};

export const getJsonRpcUrl = () => {
  // if rpc url provided by Forta Scanner i.e. in production
  if (process.env.JSON_RPC_HOST) {
    return `http://${process.env.JSON_RPC_HOST}${
      process.env.JSON_RPC_PORT ? `:${process.env.JSON_RPC_PORT}` : ""
    }`;
  }

  // else, use the rpc url from forta.config.json
  let { jsonRpcUrl } = getFortaConfig();
  if (!jsonRpcUrl) return "https://cloudflare-eth.com/";
  if (!jsonRpcUrl.startsWith("http"))
    throw new Error("jsonRpcUrl must begin with http(s)");
  return jsonRpcUrl;
};

export const getTransactionReceipt: (
  txHash: string
) => Promise<Receipt> = async (txHash: string) => {
  const ethersProvider = getEthersProvider();
  const jsonReceipt = await ethersProvider.send("eth_getTransactionReceipt", [
    txHash,
  ]);
  const receipt = {
    blockNumber: parseInt(jsonReceipt.blockNumber),
    blockHash: jsonReceipt.blockHash,
    transactionIndex: parseInt(jsonReceipt.transactionIndex),
    transactionHash: jsonReceipt.transactionHash,
    status: jsonReceipt.status === "0x1",
    logsBloom: jsonReceipt.logsBloom,
    contractAddress: jsonReceipt.contractAddress
      ? jsonReceipt.contractAddress.toLowerCase()
      : null,
    gasUsed: jsonReceipt.gasUsed,
    cumulativeGasUsed: jsonReceipt.cumulativeGasUsed,
    logs: jsonReceipt.logs.map((log: any) => ({
      address: log.address.toLowerCase(),
      topics: log.topics,
      data: log.data,
      logIndex: parseInt(log.logIndex),
      blockNumber: parseInt(log.blockNumber),
      blockHash: log.blockHash,
      transactionIndex: parseInt(log.transactionIndex),
      transactionHash: log.transactionHash,
      removed: log.removed,
    })),
    root: jsonReceipt.root ?? "",
  };
  return receipt;
};

// utility function for writing TransactionEvent tests
export const createTransactionEvent = ({
  type = EventType.BLOCK,
  network = Network.MAINNET,
  transaction,
  traces = [],
  addresses = {},
  block,
  logs = [],
  contractAddress,
}: {
  type?: EventType;
  network?: Network;
  transaction: Transaction;
  traces?: Trace[];
  addresses?: { [key: string]: boolean };
  block: TxEventBlock;
  logs: Log[];
  contractAddress: string | null;
}) => {
  return new TransactionEvent(
    type,
    network,
    transaction,
    traces,
    addresses,
    block,
    logs,
    contractAddress
  );
};

// utility function for writing BlockEvent tests
export const createBlockEvent = ({
  type = EventType.BLOCK,
  network = Network.MAINNET,
  block,
}: {
  type?: EventType;
  network?: Network;
  block: Block;
}) => {
  return new BlockEvent(type, network, block);
};

// utility function for writing AlertEvent tests
export const createAlertEvent = ({ alert }: { alert: Alert }) => {
  return new AlertEvent(alert);
};

export const assertExists = (obj: any, objName: string) => {
  if (_.isNil(obj)) throw new Error(`${objName} is required`);
};

export const assertIsNonEmptyString = (str: string, varName: string) => {
  if (!_.isString(str) || str.length === 0) {
    throw new Error(`${varName} must be non-empty string`);
  }
};

export const assertIsFromEnum = (value: any, Enum: any, varName: string) => {
  if (!Object.values(Enum).includes(value)) {
    throw new Error(`${varName} must be valid enum value`);
  }
};

export const keccak256 = (str: string) => {
  const hash = new Keccak(256);
  hash.update(str);
  return `0x${hash.digest("hex")}`;
};

let IS_PRIVATE_FINDINGS = false;
export const setPrivateFindings = (isPrivate: boolean) => {
  IS_PRIVATE_FINDINGS = isPrivate;
};

export const isPrivateFindings = () => {
  return IS_PRIVATE_FINDINGS;
};

export const getFortaApiURL = () => {
  // if forta api url provided by scanner i.e. in production
  if (process.env.FORTA_PUBLIC_API_PROXY_HOST) {
    return `http://${process.env.FORTA_PUBLIC_API_PROXY_HOST}${
      process.env.FORTA_PUBLIC_API_PROXY_PORT
        ? `:${process.env.FORTA_PUBLIC_API_PROXY_PORT}`
        : ""
    }/graphql`;
  }

  // use hardcoded value for local development
  let { fortaApiUrl } = getFortaConfig();
  if (!fortaApiUrl) return "https://api.forta.network/graphql";
  return fortaApiUrl;
};

export const getFortaApiHeaders = () => {
  const headers: any = { "content-type": "application/json" };

  // try the api key specified in env vars first
  if (process.env.FORTA_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.FORTA_API_KEY}`;
  } else {
    // use the api key from forta config if available (only for local development)
    let { fortaApiKey } = getFortaConfig();
    if (fortaApiKey) {
      headers["Authorization"] = `Bearer ${fortaApiKey}`;
    }
  }

  return {
    headers,
  };
};
