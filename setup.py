#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
from setuptools import setup

version = '0.1'
readme = os.path.join(os.path.dirname(__file__), 'README.rst')
long_description = open(readme).read()

classifiers = [
    'Environment :: Plugins',
    'Framework :: Trac',
    'Intended Audience :: System Administrators',
    'License :: OSI Approved :: MIT License',
    'Programming Language :: Python',
]

setup(
    name = 'TracJanusGatewayPlugin',
    version = version,
    author = 't-kenji',
    author_email = 'protect.2501@gmail.com',
    url = 'https://github.com/t-kenji/trac-janus-plugin',
    description = 'Janus Gateway plugin for Trac',
    long_description = long_description,

    license = 'MIT',

    packages = [ 'tracjanusgateway' ],
    classifiers = classifiers,
    install_requires = [
        'Trac',
    ],
    entry_points = {
        'trac.plugin': 'tracjanusgateway = tracjanusgateway'
    },
)