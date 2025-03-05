#!/bin/bash
etcd \
 --name=etcd-local \
 --client-cert-auth=false \
 --peer-client-cert-auth=false \
 --snapshot-count=10000 \
 --data-dir=/tmp/etcd