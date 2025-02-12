#!/bin/bash
etcd \
  --name=etcd-local \
  --client-cert-auth=false \
  --peer-client-cert-auth=false \
  --listen-client-urls=http://127.0.0.1:2378 \
  --advertise-client-urls=http://127.0.0.1:2378 \
  --listen-peer-urls=http://127.0.0.1:2381 \
  --initial-advertise-peer-urls=http://127.0.0.1:2381 \
  --initial-cluster=etcd-local=http://127.0.0.1:2381 \
  --snapshot-count=10000